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
  // Hierarchy level when the sheet exposes Project / Task / Sub Task columns.
  // 'task' or 'subtask' for rows that emit external_tasks; 'project' rows are
  // captured as LevelUp projects but are filtered OUT before upsert (they
  // represent project headers, not work items). 'flat' = no hierarchy
  // detected, behaves like the legacy single-column mode.
  hierarchyLevel?: 'project' | 'task' | 'subtask' | 'flat';
}

/** Project labels emitted by a sheet pull, so the cron can auto-create matching
 *  LevelUp projects even when no individual project-header row matched the
 *  owner filter. Returned alongside ExternalTaskInput[] from pullSmartsheet. */
export interface SmartsheetPullResult {
  rows: ExternalTaskInput[];
  /** Distinct, non-empty project labels seen anywhere in the sheet for rows
   *  that survived the owner filter. The cron deduplicates against existing
   *  LevelUp projects so it only creates new ones. */
  projectLabels: string[];
  /** Whether the sheet has at least one of Project / Task / Sub Task columns.
   *  Drives the "overwrite localProjectId" behaviour — flat sheets keep the
   *  cfg.defaultProjectId mapping; hierarchical sheets force the per-row label. */
  hierarchical: boolean;
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

/**
 * Detect the Project / Task / Sub Task hierarchy columns. Matches case-
 * insensitively and tolerates common spelling variants:
 *   - Project:   "Project", "Projects", "Project Name"
 *   - Task:      "Task", "Tasks", "Task Name", "Activity"
 *   - Sub Task:  "Sub Task", "SubTask", "Sub-Task", "Subtask", "Sub Tasks"
 * Returns undefined for any column not present so callers can branch on
 * presence (sheets with just one column fall back to flat mode).
 */
function detectHierarchyColumns(columns: SsColumn[]): {
  projectColId: number | undefined;
  taskColId: number | undefined;
  subtaskColId: number | undefined;
} {
  const projectRe = /^projects?(\s+name)?$/i;
  const taskRe = /^(tasks?(\s+name)?|activity)$/i;
  const subtaskRe = /^sub[-_\s]?tasks?$/i;
  let projectColId: number | undefined;
  let taskColId: number | undefined;
  let subtaskColId: number | undefined;
  for (const c of columns) {
    const t = (c.title || '').trim();
    if (!projectColId && projectRe.test(t)) projectColId = c.id;
    else if (!taskColId && taskRe.test(t)) taskColId = c.id;
    else if (!subtaskColId && subtaskRe.test(t)) subtaskColId = c.id;
  }
  return { projectColId, taskColId, subtaskColId };
}

/**
 * Walk up the parent chain (via row.parentId) until we hit a row whose
 * Project cell is non-empty. Used so a Task row indented under a Project
 * row inherits that project label without the Task row needing its own
 * Project cell. Walks at most 8 levels to guard against pathological data.
 */
function inheritProjectFromAncestors(
  row: SsRow,
  rowsById: Map<number, SsRow>,
  projectColId: number,
): string | null {
  let cur: SsRow | undefined = row;
  for (let i = 0; i < 8 && cur; i++) {
    const t = cellText(cellByColumn(cur, projectColId));
    if (t && t.trim()) return t.trim();
    if (!cur.parentId) break;
    cur = rowsById.get(cur.parentId);
  }
  return null;
}

/**
 * Classify a row given the detected hierarchy columns:
 *   - 'project' = row has a Project cell value, NO Task / SubTask values (it
 *                 is a header row; emit only as a LevelUp project).
 *   - 'subtask' = row has a SubTask cell value (regardless of Task cell).
 *   - 'task'    = row has a Task cell value but no SubTask cell.
 *   - null      = row matches none of the above (likely an empty separator
 *                 or a row that lives entirely in the primary column —
 *                 fall back to flat title resolution).
 */
function classifyRow(
  row: SsRow,
  projectColId: number | undefined,
  taskColId: number | undefined,
  subtaskColId: number | undefined,
): 'project' | 'task' | 'subtask' | null {
  const projectText = projectColId ? (cellText(cellByColumn(row, projectColId)) || '').trim() : '';
  const taskText = taskColId ? (cellText(cellByColumn(row, taskColId)) || '').trim() : '';
  const subtaskText = subtaskColId ? (cellText(cellByColumn(row, subtaskColId)) || '').trim() : '';
  if (subtaskText) return 'subtask';
  if (taskText) return 'task';
  if (projectText) return 'project';
  return null;
}

/**
 * For outline-style sheets where the primary column is empty on most rows
 * (e.g. the 120-Day Plan sheet has Project / Task / SubTask / Outline cols;
 * only top-level rows fill Project), resolve a per-row title by walking
 * left-to-right through TEXT_NUMBER columns until finding one with content.
 * Falls back to "(row N)" if every text column is empty.
 */
function resolveRowTitle(row: SsRow, columns: SsColumn[], primaryColId: number | undefined): string {
  // Try the primary column first — fast path for normal sheets.
  if (primaryColId !== undefined) {
    const t = cellText(cellByColumn(row, primaryColId));
    if (t && t.trim()) return t;
  }
  // Walk the remaining text-like columns in display order.
  for (const c of columns) {
    if (c.id === primaryColId) continue;
    if (c.type !== 'TEXT_NUMBER' && c.type !== 'PICKLIST') continue;
    const t = cellText(cellByColumn(row, c.id));
    if (t && t.trim()) return t;
  }
  return `(row ${row.rowNumber})`;
}

function findColumnIdByTitle(columns: SsColumn[], title: string | null | undefined): number | undefined {
  if (!title) return undefined;
  const lower = title.toLowerCase();
  return columns.find(c => c.title.toLowerCase() === lower)?.id;
}

/**
 * Fetch + filter one watched sheet. Returns normalized rows ready for upsert
 * plus the distinct project labels found, so the cron can auto-create
 * LevelUp projects.
 *
 * Sheet layout detection
 * ----------------------
 * If the sheet has any of "Project" / "Task" / "Sub Task" columns the
 * adapter switches to hierarchical mode:
 *   - Project-header rows (Project cell only) are NOT emitted as tasks; their
 *     name is captured in projectLabels so the cron can ensure a matching
 *     LevelUp project exists.
 *   - Task / SubTask rows use the matching column for their title and
 *     inherit projectLabel by walking up the parent chain to the nearest
 *     Project-cell ancestor.
 *   - SubTask rows additionally set parentExternalId so the client renders
 *     them under their parent Task.
 *
 * Sheets without those columns fall back to the legacy flat behaviour — the
 * primary column drives the title and projectLabel = sheet name (or
 * cfg.label).
 *
 * On error throws — caller logs to lastError on the watch row and continues
 * with the next sheet.
 */
export async function pullSmartsheet(
  cfg: SmartsheetWatchedSheet,
  cred: ExternalSourceCredential,
): Promise<SmartsheetPullResult> {
  const sheet = await fetchSheet(cred.apiToken, cfg.sheetId);

  const ownerColId = findColumnIdByTitle(sheet.columns, cfg.ownerColumn);
  if (ownerColId === undefined) {
    throw new Error(`Owner column "${cfg.ownerColumn}" not found in sheet "${sheet.name}"`);
  }
  const primaryColId = inferTitleColumn(sheet.columns);
  const statusColId = findColumnIdByTitle(sheet.columns, cfg.statusColumn ?? null);
  const dueColId = findColumnIdByTitle(sheet.columns, cfg.dueColumn ?? null);
  const { projectColId, taskColId, subtaskColId } = detectHierarchyColumns(sheet.columns);
  const hierarchical = !!(projectColId || taskColId || subtaskColId);

  // Index rows by id so we can resolve parent externalIds + inherit project
  // labels up the outline tree even if children appear before parents in
  // the response.
  const rowsById = new Map<number, SsRow>();
  for (const r of sheet.rows) rowsById.set(r.id, r);

  // Default: pull EVERY status (including done) so completions sync into
  // LevelUp. Users can opt into a hard filter via cfg.excludeDoneStatuses.
  const excludeStatuses = (cfg.excludeDoneStatuses ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const out: ExternalTaskInput[] = [];
  const projectLabels = new Set<string>();

  for (const row of sheet.rows) {
    const status = cellText(cellByColumn(row, statusColId));

    // Hierarchical path: classify the row first; project-header rows always
    // contribute their name to projectLabels (even if the owner doesn't
    // match — the project should exist so future tasks under it can link).
    if (hierarchical) {
      const kind = classifyRow(row, projectColId, taskColId, subtaskColId);
      if (kind === 'project') {
        const name = cellText(cellByColumn(row, projectColId!))?.trim();
        if (name) projectLabels.add(name);
        continue; // Never emit project-header rows as external tasks.
      }

      // Owner filter for actual work rows only.
      const ownerCell = cellByColumn(row, ownerColId);
      if (!rowMatchesOwner(ownerCell, cfg, cred)) continue;
      if (status && excludeStatuses.includes(status.toLowerCase())) continue;

      // Title resolution preference: SubTask col > Task col > primary > flat.
      let title: string | null = null;
      if (kind === 'subtask' && subtaskColId) title = cellText(cellByColumn(row, subtaskColId));
      if (!title && taskColId) title = cellText(cellByColumn(row, taskColId));
      if (!title) title = resolveRowTitle(row, sheet.columns, primaryColId);

      // Project label = own Project cell ∪ ancestor walk ∪ sheet fallback.
      let projectLabel: string | null = null;
      if (projectColId) {
        projectLabel = inheritProjectFromAncestors(row, rowsById, projectColId);
      }
      if (!projectLabel) projectLabel = cfg.label ?? sheet.name;
      if (projectLabel) projectLabels.add(projectLabel);

      out.push({
        source: 'smartsheet',
        sourceConfigId: cfg.id,
        externalId: String(row.id),
        externalUrl: row.permalink ?? sheet.permalink,
        title: title || `(row ${row.rowNumber})`,
        description: null,
        status: status ?? null,
        priority: null,
        due: cellText(cellByColumn(row, dueColId)),
        startDate: null,
        assignee: cellText(ownerCell),
        projectLabel,
        parentExternalId: row.parentId ? String(row.parentId) : null,
        raw: JSON.stringify({ rowNumber: row.rowNumber, cells: row.cells, kind }),
        hierarchyLevel: kind ?? 'task',
      });
      continue;
    }

    // ───── Flat fallback (legacy single-task-column sheets) ─────
    const ownerCell = cellByColumn(row, ownerColId);
    if (!rowMatchesOwner(ownerCell, cfg, cred)) continue;
    if (status && excludeStatuses.includes(status.toLowerCase())) continue;

    const title = resolveRowTitle(row, sheet.columns, primaryColId);
    const due = cellText(cellByColumn(row, dueColId));
    const assignee = cellText(ownerCell);
    const projectLabel = cfg.label ?? sheet.name;

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
      projectLabel,
      parentExternalId: row.parentId ? String(row.parentId) : null,
      raw: JSON.stringify({ rowNumber: row.rowNumber, cells: row.cells }),
      hierarchyLevel: 'flat',
    });
  }

  return { rows: out, projectLabels: Array.from(projectLabels), hierarchical };
}
