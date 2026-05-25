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
  /** Pipeline-shape detection. When true, the sheet has Stage + Value
   *  columns and the cron should populate D.opportunities, not external_tasks.
   *  In that case `rows` will be empty and `opportunities` carries the
   *  detected opps. */
  pipeline: boolean;
  /** Detected opportunities when `pipeline` is true. */
  opportunities: OpportunityInput[];
}

export interface OpportunityInput {
  externalId: string;       // sheet row id as string
  externalUrl: string | null;
  name: string;
  accountName: string | null;
  stage: string | null;
  value: number | null;     // dollars
  probability: number | null; // 0-100, null = use stage default
  closeDate: string | null; // YYYY-MM-DD
  owner: string | null;
  contact: string | null;
  notes: string | null;
  sourceConfigId: number;
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

/**
 * Detect the Project / Task / Sub Task hierarchy columns. Matches case-
 * insensitively and tolerates common spelling variants:
 *   - Project:   "Project", "Projects", "Project Name"
 *   - Task:      "Task", "Tasks", "Task Name", "Activity"
 *   - Sub Task:  "Sub Task", "SubTask", "Sub-Task", "Subtask", "Sub Tasks"
 * Returns undefined for any column not present so callers can branch on
 * presence (sheets with just one column fall back to flat mode).
 */
/**
 * Stage-name dictionary used by the multi-stage pipeline detector below.
 * If a PICKLIST column's title matches one of these, it counts as a
 * progression column. Order also defines a default progression when the
 * sheet's column order isn't strictly funnel order.
 */
const _STAGE_NAME_DICT: Array<{ re: RegExp; standard: string }> = [
  { re: /^(lead\s+gen(eration)?|lead|prospect|prospecting|outreach)$/i, standard: 'Lead' },
  { re: /^(qualif(ied|ication)|discovery|presales|pre[-\s]?sales)$/i, standard: 'Qualified' },
  { re: /^(proposal|sales|quote|pricing)$/i, standard: 'Proposal' },
  { re: /^(negotiation|negotiat(ing|e)|contract|red[-\s]?lines?)$/i, standard: 'Negotiation' },
  { re: /^(closed[-\s]?won|won|delivery|delivered|launch(ed)?|implement(ed|ation)?|deploy(ed|ment)?|signed)$/i, standard: 'Closed Won' },
  { re: /^(closed[-\s]?lost|lost|dead|disqualif(ied|y))$/i, standard: 'Closed Lost' },
];
function _matchStageColumn(title: string): string | null {
  const t = (title || '').trim();
  for (const e of _STAGE_NAME_DICT) if (e.re.test(t)) return e.standard;
  return null;
}
const _OPP_NAME_RE = /^(opportunit(y|ies)|program|project(\s+name)?|title|deal|name|product)$/i;
/**
 * Detect "is this PICKLIST cell occupied" — handles both empty cells and
 * the "Not Started" sentinel that Smartsheet picklists tend to use.
 */
function _stageCellOccupied(cell: SsCell | undefined): boolean {
  if (!cell) return false;
  const text = (cell.displayValue ?? (cell.value == null ? '' : String(cell.value))).trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower === 'not started' || lower === 'n/a' || lower === 'no') return false;
  return true;
}

/**
 * Detect Sales Pipeline shape. Two layouts supported:
 *
 *   A. SINGLE-STAGE: one column titled Stage/Phase AND one Value/Amount
 *      column. Each row's current stage comes from the Stage cell.
 *
 *   B. MULTI-STAGE PROGRESSION: 2+ PICKLIST columns whose titles match
 *      the stage dictionary above (Lead Gen / Presales / Sales / Delivery
 *      etc.). Each row's current stage = the RIGHTMOST stage column with
 *      a non-empty/non-"Not Started" cell. Value column is optional in
 *      this layout (federal contracting often doesn't track $ on the
 *      pipeline sheet).
 *
 * Either layout triggers pipeline mode. Pipeline mode wins over hierarchy.
 */
function detectPipelineColumns(columns: SsColumn[]): {
  isPipeline: boolean;
  layout: 'single' | 'multi' | null;
  stageColId?: number;            // single-stage layout
  stageColIds?: number[];         // multi-stage layout (ordered left→right)
  stageStandards?: string[];      // matching standard stage names parallel to stageColIds
  valueColId?: number;
  closeColId?: number;
  accountColId?: number;
  oppNameColId?: number;          // explicit opp-name column (Program / Opportunity)
  ownerColId?: number;
  contactColId?: number;
  probabilityColId?: number;
} {
  // Broader regex set — accommodates federal-contracting style sheets
  // ("Phase" / "Pursuit Stage" / "Award Value") in addition to typical
  // SaaS CRM column names. "Status" is matched but only triggers pipeline
  // mode when paired with a Value/Amount column (handled by the singleStage
  // check below), so a regular task sheet with a Status column won't be
  // misclassified.
  const stageRe = /^(status|stage|pipeline\s+stage|deal\s+stage|opp(?:ortunity)?\s+stage|phase|pursuit\s+stage|capture\s+stage|sales\s+stage|funnel\s+stage)$/i;
  // Value regex now allows ANY word as a prefix (Potential, Estimated,
  // Contract, Deal, Award, Total, Opportunity, Projected, etc.) plus the
  // bare forms.
  const valueRe = /^([\w-]+\s+)?(value|amount|\$)$|^(acv|tcv|arr|mrr|award|estimated\s+\$|dollar\s+amount|total\s+\$|potential\s+\$|projected\s+\$|\$\s*amount)$/i;
  const closeRe = /^(expected\s+|target\s+|exp\s+|projected\s+)?close(\s+date)?$|^exp\s+close(\s+date)?$/i;
  const accountRe = /^(account|account\s+name|customer|company|client|agency|prime)(\s+name)?$/i;
  const ownerRe = /^(owner|sales\s+owner|ae|account\s+executive|rep|sales\s+rep|pm|capture\s+manager)$/i;
  const contactRe = /^(contact|primary\s+contact|lead|poc)$/i;
  const probRe = /^(probability|win\s*%|confidence|prob|p\s*win)$/i;
  let stageColId: number | undefined;
  let valueColId: number | undefined;
  let closeColId: number | undefined;
  let accountColId: number | undefined;
  let oppNameColId: number | undefined;
  let ownerColId: number | undefined;
  let contactColId: number | undefined;
  let probabilityColId: number | undefined;
  // Track all stage-named PICKLIST columns in display order for the
  // multi-stage layout. A column counts only if it's a PICKLIST (or
  // CHECKBOX-equivalent) — TEXT_NUMBER columns whose titles happen to
  // match a stage name are usually metadata, not progression cells.
  const stageColIds: number[] = [];
  const stageStandards: string[] = [];
  for (const c of columns) {
    const t = (c.title || '').trim();
    if (!stageColId && stageRe.test(t)) stageColId = c.id;
    else if (!valueColId && valueRe.test(t)) valueColId = c.id;
    else if (!closeColId && closeRe.test(t)) closeColId = c.id;
    else if (!accountColId && accountRe.test(t)) accountColId = c.id;
    else if (!oppNameColId && _OPP_NAME_RE.test(t)) oppNameColId = c.id;
    else if (!ownerColId && ownerRe.test(t)) ownerColId = c.id;
    else if (!contactColId && contactRe.test(t)) contactColId = c.id;
    else if (!probabilityColId && probRe.test(t)) probabilityColId = c.id;
    // Multi-stage tracking — PICKLIST + matches stage dictionary.
    if (c.type === 'PICKLIST' || c.type === 'CHECKBOX') {
      const std = _matchStageColumn(t);
      if (std) { stageColIds.push(c.id); stageStandards.push(std); }
    }
  }
  // Single-stage layout: explicit Stage column + a value column.
  const singleStage = !!(stageColId && valueColId);
  // Multi-stage layout: 2+ stage-named PICKLIST columns. Value optional.
  const multiStage = stageColIds.length >= 2;
  const isPipeline = singleStage || multiStage;
  const layout: 'single' | 'multi' | null = singleStage ? 'single' : (multiStage ? 'multi' : null);
  return {
    isPipeline,
    layout,
    stageColId, stageColIds, stageStandards,
    valueColId, closeColId, accountColId,
    oppNameColId,
    ownerColId, contactColId, probabilityColId,
  };
}

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
 *
 * Only works when the sheet uses Smartsheet's outline (indent) feature.
 * Sheets that encode hierarchy by row order alone (Project header rows
 * followed by their tasks, no actual indent) need the positional fallback
 * below.
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
 * Build a row.id → projectLabel map by scanning sheet.rows in display order
 * and remembering the most-recent non-empty Project cell. Used as the
 * fallback when parentId-based ancestry returns nothing — which is the
 * case for sheets that encode hierarchy by row position only (Project
 * header rows followed by their task rows, no actual indent).
 *
 * The map covers every row including project headers themselves (so a
 * project header's own row maps to its own label). Empty until the first
 * Project cell is seen.
 *
 * Similarly builds a task-context map: row.id → parent Task row.id, so
 * SubTask rows can link to the most-recent Task row above them when
 * Smartsheet's parentId isn't set.
 */
function buildPositionalContext(
  rows: SsRow[],
  projectColId: number | undefined,
  taskColId: number | undefined,
  subtaskColId: number | undefined,
): { projectByRow: Map<number, string>; taskParentByRow: Map<number, number> } {
  const projectByRow = new Map<number, string>();
  const taskParentByRow = new Map<number, number>();
  let currentProject: string | null = null;
  let currentTaskRowId: number | null = null;
  for (const row of rows) {
    const projectText = projectColId ? (cellText(cellByColumn(row, projectColId)) || '').trim() : '';
    const taskText = taskColId ? (cellText(cellByColumn(row, taskColId)) || '').trim() : '';
    const subtaskText = subtaskColId ? (cellText(cellByColumn(row, subtaskColId)) || '').trim() : '';

    // A row updates currentProject when it has a Project cell value.
    if (projectText) {
      currentProject = projectText;
      // Reset task context — a new project starts a new task scope.
      currentTaskRowId = null;
    }
    // A row updates currentTask when it has a Task cell value but NO SubTask
    // (subtask rows shouldn't become parents of other subtasks via this path).
    if (taskText && !subtaskText) {
      currentTaskRowId = row.id;
    }
    if (currentProject) projectByRow.set(row.id, currentProject);
    if (subtaskText && currentTaskRowId) taskParentByRow.set(row.id, currentTaskRowId);
  }
  return { projectByRow, taskParentByRow };
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
  const pipeCfg = detectPipelineColumns(sheet.columns);
  const { projectColId, taskColId, subtaskColId } = detectHierarchyColumns(sheet.columns);
  // Pipeline wins over hierarchy — same sheet can't be both, but if Stage +
  // Value happen to coexist with a stray "Task" column we still treat it
  // as a pipeline sheet.
  const isPipeline = pipeCfg.isPipeline;
  const hierarchical = !isPipeline && !!(projectColId || taskColId || subtaskColId);

  // Index rows by id so we can resolve parent externalIds + inherit project
  // labels up the outline tree even if children appear before parents in
  // the response.
  const rowsById = new Map<number, SsRow>();
  for (const r of sheet.rows) rowsById.set(r.id, r);

  // Pre-pass: positional project + task ancestry. Used when row.parentId is
  // null (sheet doesn't use Smartsheet's outline; hierarchy is encoded by
  // row order — e.g. a Project header row followed by its task rows).
  const positional = hierarchical
    ? buildPositionalContext(sheet.rows, projectColId, taskColId, subtaskColId)
    : { projectByRow: new Map<number, string>(), taskParentByRow: new Map<number, number>() };

  // Default: pull EVERY status (including done) so completions sync into
  // LevelUp. Users can opt into a hard filter via cfg.excludeDoneStatuses.
  const excludeStatuses = (cfg.excludeDoneStatuses ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const out: ExternalTaskInput[] = [];
  const projectLabels = new Set<string>();
  const opportunities: OpportunityInput[] = [];

  // ── Pipeline branch ───────────────────────────────────────────────────────
  // When the sheet is pipeline-shaped, every owner-matched row becomes an
  // Opportunity. We don't emit external_tasks for pipeline sheets — the cron
  // pushes opportunities into D.opportunities instead.
  if (isPipeline) {
    const parseMoney = (s: string | null): number | null => {
      if (!s) return null;
      const cleaned = String(s).replace(/[\s,$]/g, '').replace(/[A-Za-z]/g, '');
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    };
    const parseDate = (s: string | null): string | null => {
      if (!s) return null;
      const trimmed = String(s).trim();
      // Already YYYY-MM-DD?
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };
    for (const row of sheet.rows) {
      const ownerCell = cellByColumn(row, ownerColId);
      if (!rowMatchesOwner(ownerCell, cfg, cred)) continue;
      // Opp name resolution: dedicated opp-name column (Program / Opportunity)
      // wins over primary column. For a sheet where Customer is primary,
      // this prevents the row title becoming "Air Force" instead of the
      // actual deal name in Program.
      let name: string | null = null;
      if (pipeCfg.oppNameColId) name = cellText(cellByColumn(row, pipeCfg.oppNameColId));
      if (!name || !name.trim()) name = resolveRowTitle(row, sheet.columns, primaryColId);
      // Stage resolution: try single-stage column first, then fall back to
      // multi-stage progression. This handles the common "user added a
      // Status column but hasn't filled cells yet, while the older
      // Lead Gen/Presales/Sales/Delivery columns still have data" case.
      let stage: string | null = null;
      if (pipeCfg.stageColId) {
        stage = cellText(cellByColumn(row, pipeCfg.stageColId));
      }
      if (!stage && pipeCfg.stageColIds && pipeCfg.stageColIds.length && pipeCfg.stageStandards) {
        // Rightmost occupied stage column wins.
        let lastIdx = -1;
        for (let i = 0; i < pipeCfg.stageColIds.length; i++) {
          if (_stageCellOccupied(cellByColumn(row, pipeCfg.stageColIds[i]))) lastIdx = i;
        }
        if (lastIdx >= 0) stage = pipeCfg.stageStandards[lastIdx];
      }
      // Value: read the single-stage Value/Amount cell. No fallback —
      // multi-stage layouts traditionally don't have a value column.
      const value = pipeCfg.valueColId ? parseMoney(cellText(cellByColumn(row, pipeCfg.valueColId))) : null;
      const closeDate = pipeCfg.closeColId ? parseDate(cellText(cellByColumn(row, pipeCfg.closeColId))) : null;
      const accountName = pipeCfg.accountColId ? cellText(cellByColumn(row, pipeCfg.accountColId)) : null;
      const opOwner = (pipeCfg.ownerColId && cellText(cellByColumn(row, pipeCfg.ownerColId))) || cellText(ownerCell);
      const contact = pipeCfg.contactColId ? cellText(cellByColumn(row, pipeCfg.contactColId)) : null;
      const probRaw = pipeCfg.probabilityColId ? cellText(cellByColumn(row, pipeCfg.probabilityColId)) : null;
      let probability: number | null = null;
      if (probRaw) {
        const m = String(probRaw).match(/[\d.]+/);
        if (m) probability = Math.max(0, Math.min(100, parseFloat(m[0])));
      }
      // For multi-stage layout, also surface the per-stage cell snapshot in
      // notes so the user can see "Lead Gen: Done · Presales: In Progress"
      // in the opp drawer without re-syncing.
      let notes: string | null = null;
      if (pipeCfg.layout === 'multi' && pipeCfg.stageColIds && pipeCfg.stageColIds.length) {
        const lines: string[] = [];
        for (let i = 0; i < pipeCfg.stageColIds.length; i++) {
          const col = sheet.columns.find(cc => cc.id === pipeCfg.stageColIds![i]);
          const v = cellText(cellByColumn(row, pipeCfg.stageColIds[i]));
          if (col && v) lines.push(`${col.title}: ${v}`);
        }
        if (lines.length) notes = lines.join('\n');
      }
      opportunities.push({
        externalId: String(row.id),
        externalUrl: row.permalink ?? sheet.permalink,
        name: name || `(row ${row.rowNumber})`,
        accountName,
        stage,
        value,
        probability,
        closeDate,
        owner: opOwner,
        contact,
        notes,
        sourceConfigId: cfg.id,
        raw: JSON.stringify({ rowNumber: row.rowNumber, cells: row.cells, layout: pipeCfg.layout }),
      });
    }
    return { rows: [], projectLabels: [], hierarchical: false, pipeline: true, opportunities };
  }

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

      // Project label resolution order:
      //   1. Smartsheet outline walk via parentId (only when sheet uses indent).
      //   2. Positional ancestry — most-recent Project header row above this
      //      one in display order (covers flat sheets like the CF 120-Day Plan).
      //   3. cfg.label / sheet.name as last resort.
      let projectLabel: string | null = null;
      if (projectColId) {
        projectLabel = inheritProjectFromAncestors(row, rowsById, projectColId);
      }
      if (!projectLabel) projectLabel = positional.projectByRow.get(row.id) ?? null;
      if (!projectLabel) projectLabel = cfg.label ?? sheet.name;
      if (projectLabel) projectLabels.add(projectLabel);

      // SubTask parent: Smartsheet parentId first, then positional task
      // context (most-recent Task row above this one).
      const parentExternalId = row.parentId
        ? String(row.parentId)
        : (kind === 'subtask' ? (positional.taskParentByRow.get(row.id)?.toString() ?? null) : null);

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
        parentExternalId,
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

  return { rows: out, projectLabels: Array.from(projectLabels), hierarchical, pipeline: false, opportunities: [] };
}
