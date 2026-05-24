/**
 * Smartsheet adapter.
 *
 * Fetches rows from configured sheets where the user is the owner, normalizes
 * them to ExternalTaskInput shape, and returns them for upsert into
 * external_tasks.
 *
 * Per-sheet config (smartsheet_watched_sheets) drives owner-column +
 * match-mode selection because column names and value formats vary across
 * sheets ("Owner" / "Assignee" / "AO"; "Idris" / "Idris + Ayesha" /
 * contact-list cells with typed userIds).
 *
 * Smartsheet API docs: https://smartsheet.redoc.ly/
 */

import type { SmartsheetWatchedSheet, ExternalSourceCredential } from "../../drizzle/schema";

const SS_API = "https://api.smartsheet.com/2.0";

export interface ExternalTaskInput {
  source: 'smartsheet';
  sourceConfigId: number;
  externalId: string;
  externalUrl: string | null;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  due: string | null;
  startDate: string | null;
  assignee: string | null;
  projectLabel: string | null;
  parentExternalId: string | null;
  raw: string;
}

interface SsColumn {
  id: number;
  title: string;
  type: string; // TEXT_NUMBER | DATE | CONTACT_LIST | PICKLIST | …
}

interface SsCell {
  columnId: number;
  value?: string | number | boolean;
  displayValue?: string;
  contacts?: Array<{ email?: string; name?: string }>;
}

interface SsRow {
  id: number;
  rowNumber: number;
  parentId?: number;
  permalink?: string;
  cells: SsCell[];
}

interface SsSheetResponse {
  id: number;
  name: string;
  permalink: string;
  columns: SsColumn[];
  rows: SsRow[];
}

/**
 * Look up the authenticated Smartsheet user. Used at token-entry time to
 * capture the canonical account so owner matching can use a real id rather
 * than a typed display name.
 */
export async function fetchSmartsheetMe(apiToken: string): Promise<{
  id: number;
  email: string;
  name: string;
}> {
  const resp = await fetch(`${SS_API}/users/me`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Smartsheet /users/me failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json() as { id: number; email: string; firstName?: string; lastName?: string; name?: string };
  return {
    id: data.id,
    email: data.email,
    name: data.name || [data.firstName, data.lastName].filter(Boolean).join(' '),
  };
}

/**
 * Fetch a single sheet's columns + rows. Includes parentId on rows for
 * hierarchy reconstruction and permalink for deep-linking.
 */
export async function fetchSheet(apiToken: string, sheetId: string): Promise<SsSheetResponse> {
  // include rowPermalink so we can deep-link each row, not just the sheet
  const resp = await fetch(`${SS_API}/sheets/${sheetId}?include=rowPermalink`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!resp.ok) {
    throw new Error(`Smartsheet /sheets/${sheetId} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json() as Promise<SsSheetResponse>;
}

function cellByColumn(row: SsRow, columnId: number | undefined): SsCell | undefined {
  if (columnId === undefined) return undefined;
  return row.cells.find(c => c.columnId === columnId);
}

function cellText(cell: SsCell | undefined): string | null {
  if (!cell) return null;
  if (cell.displayValue) return cell.displayValue;
  if (cell.value === undefined || cell.value === null) return null;
  return String(cell.value);
}

/**
 * Owner matching. Three modes:
 *  - 'exact'    : displayValue === ownerMatchValue (case-insensitive)
 *  - 'contains' : displayValue includes ownerMatchValue (case-insensitive)
 *                 — handles "Idris + Ayesha" / "Idris, Ayesha" style cells
 *  - 'contact'  : cell is a CONTACT_LIST cell; match by accountExternalId
 *                 (Smartsheet user id) or accountEmail
 */
function rowMatchesOwner(
  cell: SsCell | undefined,
  cfg: SmartsheetWatchedSheet,
  cred: ExternalSourceCredential | null,
): boolean {
  if (!cell) return false;
  const matchValue = cfg.ownerMatchValue?.trim() ?? '';
  const mode = cfg.matchMode ?? 'contains';

  if (mode === 'contact') {
    if (!cell.contacts || cell.contacts.length === 0) return false;
    const myEmail = cred?.accountEmail?.toLowerCase() ?? null;
    const myMatch = matchValue.toLowerCase();
    return cell.contacts.some(c => {
      const email = (c.email ?? '').toLowerCase();
      if (myEmail && email === myEmail) return true;
      if (email === myMatch) return true;
      if ((c.name ?? '').toLowerCase().includes(myMatch)) return true;
      return false;
    });
  }

  const text = cellText(cell)?.toLowerCase() ?? '';
  const needle = matchValue.toLowerCase();
  if (!needle) return false;
  return mode === 'exact' ? text === needle : text.includes(needle);
}

function inferTitleColumn(columns: SsColumn[]): number | undefined {
  // Smartsheet's "primary" column is always columns[0] in API responses;
  // it's the column users see as the row's title.
  return columns[0]?.id;
}

function findColumnIdByTitle(columns: SsColumn[], title: string | null | undefined): number | undefined {
  if (!title) return undefined;
  const lower = title.toLowerCase();
  return columns.find(c => c.title.toLowerCase() === lower)?.id;
}

/**
 * Fetch + filter one watched sheet. Returns normalized rows ready for upsert.
 * On error throws — caller logs to lastError on the watch row and continues
 * with the next sheet.
 */
export async function pullSmartsheet(
  cfg: SmartsheetWatchedSheet,
  cred: ExternalSourceCredential,
): Promise<ExternalTaskInput[]> {
  const sheet = await fetchSheet(cred.apiToken, cfg.sheetId);

  const ownerColId = findColumnIdByTitle(sheet.columns, cfg.ownerColumn);
  if (ownerColId === undefined) {
    throw new Error(`Owner column "${cfg.ownerColumn}" not found in sheet "${sheet.name}"`);
  }
  const titleColId = inferTitleColumn(sheet.columns);
  const statusColId = findColumnIdByTitle(sheet.columns, cfg.statusColumn ?? null);
  const dueColId = findColumnIdByTitle(sheet.columns, cfg.dueColumn ?? null);

  // Index rows by id so we can resolve parent externalIds even if they
  // appear after their children in the sheet response.
  const rowsById = new Map<number, SsRow>();
  for (const r of sheet.rows) rowsById.set(r.id, r);

  const excludeStatuses = (cfg.excludeDoneStatuses ?? 'Done,Complete,Closed,Cancelled')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const out: ExternalTaskInput[] = [];
  for (const row of sheet.rows) {
    const ownerCell = cellByColumn(row, ownerColId);
    if (!rowMatchesOwner(ownerCell, cfg, cred)) continue;

    const status = cellText(cellByColumn(row, statusColId));
    if (status && excludeStatuses.includes(status.toLowerCase())) continue;

    const title = cellText(cellByColumn(row, titleColId)) ?? `(row ${row.rowNumber})`;
    const due = cellText(cellByColumn(row, dueColId));
    const assignee = cellText(ownerCell);

    out.push({
      source: 'smartsheet',
      sourceConfigId: cfg.id,
      externalId: String(row.id),
      externalUrl: row.permalink ?? sheet.permalink,
      title,
      description: null,
      status: status ?? null,
      priority: null,
      due,
      startDate: null,
      assignee,
      projectLabel: cfg.label ?? sheet.name,
      parentExternalId: row.parentId ? String(row.parentId) : null,
      raw: JSON.stringify({ rowNumber: row.rowNumber, cells: row.cells }),
    });
  }
  return out;
}
