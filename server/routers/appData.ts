import { eq, and, ne, isNull, asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { userAppData, tasksTable, notesTable, ideasTable, externalTasks, users, systemSettings } from "../../drizzle/schema";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";

/**
 * Full visibility ("see every member's items") in the shared-workspace read
 * endpoints is reserved for the WORKSPACE OWNER — the configured OWNER_OPEN_ID
 * account or, failing that, the first registered user (same rule as the
 * auth.me owner-promotion). Plain admins keep their edit/take-ownership powers
 * but only SEE items actually assigned to them — otherwise inviting a teammate
 * as Admin exposed the owner's entire workspace (tasks/notes/projects/…) as
 * "shared with them". Min-user-id lookup cached ~60s.
 */
let _minUserIdCache: { id: number | null; at: number } | null = null;
/**
 * Per-item share permission. `shareMode` on an item is 'view' | 'edit';
 * absent = legacy default, which preserves pre-permissions behaviour:
 * notes were view-only for recipients, sheets/decks were co-editable.
 * `shareAll: true` additionally makes the item visible to every workspace
 * member (not just assignees). Admins and the item's owner are never
 * limited by shareMode.
 */
function effShareMode(p: any, dflt: 'view' | 'edit'): 'view' | 'edit' {
  return (p && (p.shareMode === 'view' || p.shareMode === 'edit')) ? p.shareMode : dflt;
}

export async function isOwnerCtxUser(user: { id: number; openId?: string | null }): Promise<boolean> {
  try {
    const { ENV } = await import("../_core/env");
    if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) return true;
  } catch {}
  const now = Date.now();
  if (!_minUserIdCache || now - _minUserIdCache.at > 60000) {
    let id: number | null = null;
    try {
      const db = await getDb();
      if (db) {
        const first = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
        id = first.length ? first[0].id : null;
      }
    } catch {}
    _minUserIdCache = { id, at: now };
  }
  return _minUserIdCache.id != null && user.id === _minUserIdCache.id;
}

// system_settings row holding the owner-published starter layout for new
// teammates. See setTeamStarterPreset / getTeamStarterPreset at the bottom.
const TEAM_PRESET_KEY = 'teamStarterPreset';

// Keys that can be saved/loaded
const DATA_KEYS =['projects', 'goals', 'journal', 'habits', 'contacts', 'teams', 'prefs', 'calEvents', 'clusters', 'programs', 'opportunities', 'atlas', 'atlasAnnotations', 'mindmaps', 'sheets', 'decks', 'finance', 'calGrid'] as const;
type DataKey = typeof DATA_KEYS[number];

// Truncate a value to a column's max length (defensive against varchar overflow).
function _col(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Mirror the `tasks` JSON array into the relational `tasks` table for one user.
 * Delete-all + re-insert keeps it a faithful copy of the blob. Returns the row
 * count, or undefined if the input wasn't a usable JSON array.
 */
// Team-visibility (migration 0045): resolve the legacy createdBy/assignedTo
// NAME strings to stable userIds. Cached ~60s so we don't re-query users on
// every save. Empty map on failure → ids fall back to null/owner (harmless).
let _uidMapCache: { map: Map<string, number>; at: number } | null = null;
export async function _resolveUserIdMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (_uidMapCache && now - _uidMapCache.at < 60000) return _uidMapCache.map;
  const map = new Map<string, number>();
  try {
    const { adminListAllUsers } = await import("../db");
    const users = await adminListAllUsers();
    // Display names are NOT unique. Two accounts named "Idris Grant" (the
    // owner and the demo account) once made this last-writer-wins map stamp
    // the owner's tasks with the demo account as assignee, so 71 personal
    // tasks showed up in the demo account's "Shared & delegated" section.
    // An ambiguous name must resolve to NOTHING; emails stay unique.
    const nameCount = new Map<string, number>();
    for (const u of users) {
      const n = u.name ? String(u.name).trim().toLowerCase() : "";
      if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
    }
    for (const u of users) {
      const n = u.name ? String(u.name).trim().toLowerCase() : "";
      if (n && nameCount.get(n) === 1) map.set(n, u.id);
      if (u.email) map.set(String(u.email).trim().toLowerCase(), u.id);
    }
  } catch { /* leave empty — ids stay null, no harm */ }
  _uidMapCache = { map, at: now };
  return map;
}

/**
 * The strings under which the current user may be named as `assignedTo` on a
 * blob-stored item: their email, and their display name ONLY when no other
 * account shares it. Every shared*ForMe reader and share-permission check
 * goes through this so a name collision can never grant visibility.
 */
export function _myAssigneeKeys(
  users: Array<{ id: number; name?: string | null; email?: string | null }>,
  me: { name?: string | null; email?: string | null } | undefined
): string[] {
  const out: string[] = [];
  if (!me) return out;
  const email = me.email ? String(me.email).trim().toLowerCase() : "";
  if (email) out.push(email);
  const name = me.name ? String(me.name).trim().toLowerCase() : "";
  if (name) {
    const shared = users.filter((u) => u.name && String(u.name).trim().toLowerCase() === name).length;
    if (shared <= 1) out.push(name);
  }
  return out;
}

/**
 * Is this task row assigned to `userId`? Decided from the task's own JSON
 * (assignees / primaryAssigneeId / an unambiguous assignedTo name), the same
 * rule sharedTasksForMe uses. The stamped `assigneeId` column alone is NOT
 * trusted: a stale stamp from a name collision once handed one user's tasks
 * to another account (-198).
 */
export function _taskAssignedTo(row: { raw?: string | null; assigneeId?: number | null }, userId: number, idMap: Map<string, number>): boolean {
  try {
    const t = JSON.parse(row.raw || '{}');
    if (Array.isArray(t.assignees) && t.assignees.map((x: any) => Number(x)).includes(userId)) return true;
    if (t.primaryAssigneeId != null && Number(t.primaryAssigneeId) === userId) return true;
    const nm = t.assignedTo ? String(t.assignedTo).trim().toLowerCase() : '';
    if (nm && idMap.get(nm) === userId) return true;
    if (row.assigneeId === userId && !nm && !Array.isArray(t.assignees)) return true;
  } catch {
    return row.assigneeId === userId;
  }
  return false;
}

// ─── Tasks / notes / ideas storage (relational) ─────────────────────────────
// Phase 1 (build -226): the whole-array "delete every row, re-insert" save was
// the biggest data-loss risk in the app — a device with a stale list erased
// everything other devices had added. Now:
//   • appData.syncEntity  applies only what a device changed (upserts) and what
//     it explicitly removed (deletes), and refuses to overwrite or delete an
//     item another device changed since this one last saw it (baseHash check).
//   • the legacy full-array path (old clients during deploy skew, and
//     server-side writeEntityArray callers) runs in a TRANSACTION and refuses
//     an obvious wipe (see _guardShrink).
//   • list order lives in user_app_data.entityOrder (rows are no longer
//     re-inserted in array order).
type EntityKind = 'tasks' | 'notes' | 'ideas';
const ENTITY_TABLE: Record<EntityKind, any> = { tasks: tasksTable, notes: notesTable, ideas: ideasTable };
const ENTITY_ID_COL: Record<EntityKind, 'taskId' | 'noteId' | 'ideaId'> = { tasks: 'taskId', notes: 'noteId', ideas: 'ideaId' };

/** FNV-1a 32-bit over UTF-16 code units — identical to the client's _luHash. */
export function _itemHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

function _taskRow(t: any, userId: number, resolveId: (s: any) => number | null) {
  return {
    userId,
    taskId: String(t.id).slice(0, 40),
    title: _col(t.title, 512),
    status: _col(t.status, 32),
    priority: _col(t.priority, 16),
    due: _col(t.due, 32),
    startDate: _col(t.startDate, 32),
    completedAt: _col(t.completedAt, 40),
    projectId: _col(t.projectId, 40),
    clusterId: _col(t.clusterId, 40),
    myDay: t.myDay ? 1 : 0,
    context: _col(t.context, 64),
    assignedTo: _col(t.assignedTo, 255),
    createdBy: _col(t.createdBy, 255),
    // Stable userId-based owner + assignee (migration 0045). Owner falls back
    // to the row's user when createdBy is missing/unresolved.
    createdById: resolveId(t.createdBy) ?? userId,
    assigneeId: resolveId(t.assignedTo),
    raw: JSON.stringify(t),
  };
}
function _noteRow(n: any, userId: number) {
  return {
    userId,
    noteId: String(n.id).slice(0, 40),
    title: _col(n.title, 512),
    folderId: _col(n.folderId, 40),
    pinned: n.pinned ? 1 : 0,
    starred: n.starred ? 1 : 0,
    archived: n.archived ? 1 : 0,
    color: _col(n.color, 32),
    updatedAt: _col(n.updated, 40),
    createdAt: _col(n.createdAt, 40),
    // Team-visibility (migration 0045): a note's creator is its owning user;
    // notes aren't assigned, so assigneeId stays null.
    createdById: (n.createdById != null ? n.createdById : userId),
    assigneeId: (n.assigneeId != null ? n.assigneeId : null),
    raw: JSON.stringify(n),
  };
}
function _ideaRow(i: any, userId: number) {
  return {
    userId,
    ideaId: String(i.id).slice(0, 40),
    title: _col(i.title, 512),
    stage: _col(i.stage, 32),
    ideaType: _col(i.idea_type, 32),
    goalId: _col(i.goal_id, 40),
    iceImpact: typeof i.ice_impact === 'number' ? i.ice_impact : null,
    iceConfidence: typeof i.ice_confidence === 'number' ? i.ice_confidence : null,
    iceEase: typeof i.ice_ease === 'number' ? i.ice_ease : null,
    createdBy: _col(i.createdBy, 255),
    createdAt: _col(i.createdAt, 40),
    raw: JSON.stringify(i),
  };
}
async function _rowBuilder(kind: EntityKind, userId: number): Promise<(x: any) => any> {
  if (kind === 'tasks') {
    const idMap = await _resolveUserIdMap();
    const resolveId = (s: any): number | null => (s ? idMap.get(String(s).trim().toLowerCase()) ?? null : null);
    return (t) => _taskRow(t, userId, resolveId);
  }
  return kind === 'notes' ? (n) => _noteRow(n, userId) : (i) => _ideaRow(i, userId);
}

/** Items with a usable id. Ids must be finite numbers or non-empty strings. */
function _validItem(x: any): boolean {
  if (!x || x.id == null) return false;
  if (typeof x.id === 'number') return Number.isFinite(x.id);
  return String(x.id).length > 0 && String(x.id) !== 'NaN' && String(x.id) !== 'null';
}

/**
 * Refuse a full-array save that looks like a wipe rather than an edit: an
 * empty list replacing 5+ items, or a list that drops more than 80% of 20+
 * items. Per-item sync makes deletes explicit, so legitimate bulk deletes
 * never come through here from current clients.
 */
function _guardShrink(kind: EntityKind, existing: number, incoming: number) {
  if ((incoming === 0 && existing >= 5) || (existing >= 20 && incoming < existing * 0.2)) {
    throw new Error(`Refused to replace ${existing} ${kind} with ${incoming} — this looks like a stale or empty copy. Reload the app and try again.`);
  }
}

/** Full-array replace (legacy path), atomic. */
async function _replaceEntity(db: any, userId: number, kind: EntityKind, json: string, opts?: { guard?: boolean }) {
  let arr: any;
  // Authoritative write — reject bad payloads loudly instead of silently
  // storing nothing while the save reports ok.
  try { arr = JSON.parse(json); } catch { throw new Error(`${kind} payload is not valid JSON`); }
  if (!Array.isArray(arr)) throw new Error(`${kind} payload is not an array`);
  const build = await _rowBuilder(kind, userId);
  const idCol = ENTITY_ID_COL[kind];
  const seen = new Set<string>();
  const rows = arr.filter(_validItem).map(build).filter((r: any) => !seen.has(r[idCol]) && seen.add(r[idCol]));
  const table = ENTITY_TABLE[kind];
  await db.transaction(async (tx: any) => {
    if (opts?.guard) {
      const cur = await tx.select({ id: table.id }).from(table).where(eq(table.userId, userId));
      _guardShrink(kind, cur.length, rows.length);
    }
    await tx.delete(table).where(eq(table.userId, userId));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(table).values(rows.slice(i, i + 200));
  });
  // Rows were re-inserted in array order, so PK order is the list order again.
  await _setEntityOrder(db, userId, kind, null);
  return rows.length;
}
async function mirrorTasksToRelational(db: any, userId: number, json: string, opts?: { guard?: boolean }) { return _replaceEntity(db, userId, 'tasks', json, opts); }
async function mirrorNotesToRelational(db: any, userId: number, json: string, opts?: { guard?: boolean }) { return _replaceEntity(db, userId, 'notes', json, opts); }
async function mirrorIdeasToRelational(db: any, userId: number, json: string, opts?: { guard?: boolean }) { return _replaceEntity(db, userId, 'ideas', json, opts); }

async function _getEntityOrder(db: any, userId: number): Promise<Record<string, string[]>> {
  try {
    const [row] = await db.select({ o: userAppData.entityOrder }).from(userAppData).where(eq(userAppData.userId, userId)).limit(1);
    const o = row?.o ? JSON.parse(row.o) : null;
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
async function _setEntityOrder(db: any, userId: number, kind: EntityKind, order: string[] | null) {
  try {
    const cur = await _getEntityOrder(db, userId);
    if (order) cur[kind] = order.map(String).slice(0, 20000); else delete cur[kind];
    const v = JSON.stringify(cur);
    await db.insert(userAppData).values({ userId, entityOrder: v }).onDuplicateKeyUpdate({ set: { entityOrder: v } });
  } catch (e) {
    console.warn('[appData] could not store list order:', (e as Error)?.message);
  }
}

/** Rows → items, in the user's stored order (unknown ids keep PK order, after). */
async function _readEntity(db: any, userId: number, kind: EntityKind): Promise<any[]> {
  const table = ENTITY_TABLE[kind];
  const rows = await db.select().from(table).where(eq(table.userId, userId)).orderBy(table.id);
  const items = rows.map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } }).filter(Boolean);
  const order = (await _getEntityOrder(db, userId))[kind];
  if (!Array.isArray(order) || !order.length) return items;
  const pos = new Map<string, number>();
  order.forEach((id, i) => { if (!pos.has(String(id))) pos.set(String(id), i); });
  const known: any[] = [], unknown: any[] = [];
  for (const it of items) (pos.has(String(it.id)) ? known : unknown).push(it);
  known.sort((a, b) => (pos.get(String(a.id))! - pos.get(String(b.id))!));
  return known.concat(unknown);
}

async function readTasks(db: any, userId: number): Promise<{ tasks: any[]; source: string }> {
  // Step 3b (2026-10-14): the relational table is the only store. No
  // fallback: a failed read must fail the load.
  return { tasks: await _readEntity(db, userId, 'tasks'), source: 'relational' };
}
async function readNotes(db: any, userId: number): Promise<{ notes: any[]; source: string }> {
  return { notes: await _readEntity(db, userId, 'notes'), source: 'relational' };
}
async function readIdeas(db: any, userId: number): Promise<{ ideas: any[]; source: string }> {
  return { ideas: await _readEntity(db, userId, 'ideas'), source: 'relational' };
}

/**
 * Apply one device's per-item changes atomically. An upsert or delete that
 * carries the hash of the item as the device last saw it is refused when the
 * stored item has changed since (another device or a server job edited it):
 * the stored version comes back in `conflicts` so the device can adopt it.
 */
export async function applyEntityChanges(db: any, userId: number, kind: EntityKind, input: {
  upserts: Array<{ id: string; raw: string; baseHash?: string | null }>;
  deletes: Array<{ id: string; baseHash?: string | null }>;
  order?: string[] | null;
}) {
  const table = ENTITY_TABLE[kind];
  const idCol = ENTITY_ID_COL[kind];
  const build = await _rowBuilder(kind, userId);
  const applied: Array<{ id: string; hash: string }> = [];
  const deleted: string[] = [];
  const conflicts: Array<{ id: string; raw: string | null }> = [];
  await db.transaction(async (tx: any) => {
    for (const u of input.upserts) {
      let item: any;
      try { item = JSON.parse(u.raw); } catch { throw new Error(`${kind} item ${u.id} is not valid JSON`); }
      if (!_validItem(item) || String(item.id).slice(0, 40) !== String(u.id).slice(0, 40)) throw new Error(`${kind} item id mismatch for ${u.id}`);
      const row = build(item);
      const [cur] = await tx.select({ id: table.id, raw: table.raw }).from(table)
        .where(and(eq(table.userId, userId), eq(table[idCol], row[idCol]))).limit(1);
      if (cur) {
        const curHash = _itemHash(String(cur.raw ?? ''));
        if (cur.raw === row.raw) { applied.push({ id: u.id, hash: curHash }); continue; }
        if (u.baseHash && curHash !== u.baseHash) { conflicts.push({ id: u.id, raw: cur.raw ?? null }); continue; }
        const { userId: _u, ...set } = row;
        await tx.update(table).set(set).where(eq(table.id, cur.id));
      } else {
        await tx.insert(table).values(row);
      }
      applied.push({ id: u.id, hash: _itemHash(row.raw) });
    }
    for (const d of input.deletes) {
      const key = String(d.id).slice(0, 40);
      const [cur] = await tx.select({ id: table.id, raw: table.raw }).from(table)
        .where(and(eq(table.userId, userId), eq(table[idCol], key))).limit(1);
      if (!cur) { deleted.push(d.id); continue; }
      if (d.baseHash && _itemHash(String(cur.raw ?? '')) !== d.baseHash) { conflicts.push({ id: d.id, raw: cur.raw ?? null }); continue; }
      await tx.delete(table).where(eq(table.id, cur.id));
      deleted.push(d.id);
    }
  });
  if (input.order) await _setEntityOrder(db, userId, kind, input.order);
  // Bump updatedAt: the client's offline-merge logic dates server writes by it.
  await db.insert(userAppData).values({ userId }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  return { applied, deleted, conflicts };
}

// Table-based array access for the migrated entities — used by server-side
// jobs (image migration, ownership transfer, automations). The write is a
// full replace in a transaction; it does not use the shrink guard because
// these callers read the current list and write it back.
async function _relStatus(userId: number, table: any) {
  const db = await getDb();
  if (!db) return { ok: false as const };
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.userId, userId));
  return { ok: true as const, tableCount: rows.length, blobCount: null, consistent: true };
}
export async function readEntityArray(db: any, userId: number, kind: 'tasks' | 'notes' | 'ideas'): Promise<any[]> {
  return _readEntity(db, userId, kind);
}
export async function writeEntityArray(db: any, userId: number, kind: 'tasks' | 'notes' | 'ideas', arr: any[], opts?: { deleteIds?: string[] }): Promise<string> {
  // Write only the difference against what is stored now: changed items are
  // upserted, the rest untouched, so a job that read the list a moment ago
  // can't overwrite an item a device synced since (unless the job changed
  // that same item). Nothing is deleted unless its id is passed in
  // opts.deleteIds — an item missing from the job's copy may simply have been
  // added by a device after the job read the list.
  const json = JSON.stringify(arr);
  const table = ENTITY_TABLE[kind];
  const idCol = ENTITY_ID_COL[kind];
  const cur = await db.select({ key: table[idCol], raw: table.raw }).from(table).where(eq(table.userId, userId));
  const stored = new Map<string, string>(cur.map((r: any) => [String(r.key), String(r.raw ?? '')]));
  const upserts: Array<{ id: string; raw: string }> = [];
  const keep = new Set<string>();
  for (const it of arr) {
    if (!_validItem(it)) continue;
    const id = String(it.id).slice(0, 40);
    if (keep.has(id)) continue;
    keep.add(id);
    const raw = JSON.stringify(it);
    if (stored.get(id) !== raw) upserts.push({ id, raw });
  }
  const want = new Set((opts?.deleteIds || []).map((x) => String(x).slice(0, 40)));
  const deletes = Array.from(stored.keys()).filter((id) => want.has(id) && !keep.has(id)).map((id) => ({ id }));
  // Order: the job's list first, then anything it didn't know about.
  const order = Array.from(keep).concat(Array.from(stored.keys()).filter((id) => !keep.has(id) && !want.has(id)));
  await applyEntityChanges(db, userId, kind, { upserts, deletes, order });
  return json;
}

/** Set finance._rev to (stored revision + 1) on an incoming Money blob. */
async function _bumpFinanceRev(db: any, userId: number, json: string): Promise<string> {
  try {
    const next = JSON.parse(json);
    if (!next || typeof next !== 'object' || Array.isArray(next)) return json;
    const [row] = await db.select({ finance: userAppData.finance }).from(userAppData).where(eq(userAppData.userId, userId)).limit(1);
    let rev = 0;
    try { rev = Number(JSON.parse((row as any)?.finance || 'null')?._rev) || 0; } catch { rev = 0; }
    next._rev = rev + 1;
    return JSON.stringify(next);
  } catch { return json; }
}

export const appDataRouter = router({
  /**
   * Load all saved data blobs for the current user.
   * Returns an object with only the keys that have saved data (null for unsaved keys).
   */
  load: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);

    if (!rows.length) return null;

    const row = rows[0];
    const result: Record<string, unknown> = {};
    for (const key of DATA_KEYS) {
      const raw = row[key as keyof typeof row] as string | null;
      if (raw != null) {
        try {
          result[key] = JSON.parse(raw);
        } catch {
          result[key] = null;
        }
      } else {
        result[key] = null;
      }
    }
    // Tasks / notes / ideas live only in their relational tables (Step 3b).
    // The _xSource fields stay for Settings → Admin → Migration Health.
    result.tasks = (await readTasks(db, ctx.user.id)).tasks; result._tasksSource = 'relational';
    result.notes = (await readNotes(db, ctx.user.id)).notes; result._notesSource = 'relational';
    result.ideas = (await readIdeas(db, ctx.user.id)).ideas; result._ideasSource = 'relational';
    result.updatedAt = row.updatedAt;
    return result;
  }),

  /**
   * Save one or more data blobs for the current user.
   * Accepts a partial object — only provided keys are updated.
   */
  save: protectedProcedure
    .input(
      z.object({
        tasks:     z.string().optional(),
        notes:     z.string().optional(),
        projects:  z.string().optional(),
        goals:     z.string().optional(),
        journal:   z.string().optional(),
        habits:    z.string().optional(),
        contacts:  z.string().optional(),
        ideas:     z.string().optional(),
        teams:     z.string().optional(),
        prefs:     z.string().optional(),
        calEvents: z.string().optional(),
        clusters:  z.string().optional(),
        programs:  z.string().optional(),
        opportunities: z.string().optional(),
        atlasAnnotations: z.string().optional(),
        mindmaps: z.string().optional(),
        sheets: z.string().optional(),
        decks: z.string().optional(),
        finance: z.string().optional(),
        calGrid: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };

      // Step 3a (blob retirement, 2026-07-12): tasks / notes / ideas no longer
      // write to their user_app_data blob columns — the relational tables are
      // the sole store. The blob columns are FROZEN with their pre-3a contents
      // as a rollback safety net until Step 3b drops them. The client payload
      // shape is unchanged.
      const updates: Partial<Record<DataKey, string>> = {};
      for (const key of DATA_KEYS) {
        const val = input[key as keyof typeof input];
        if (val !== undefined) {
          updates[key as DataKey] = val;
        }
      }
      // Money: every write bumps the budget's revision so people it is shared
      // with can't overwrite it from a stale copy (see updateSharedFinance).
      if (updates.finance !== undefined) updates.finance = await _bumpFinanceRev(db, ctx.user.id, updates.finance);
      const hasRelational = input.tasks !== undefined || input.notes !== undefined || input.ideas !== undefined;

      if (Object.keys(updates).length === 0 && !hasRelational) return { ok: true };

      if (Object.keys(updates).length > 0) {
        await db
          .insert(userAppData)
          .values({ userId: ctx.user.id, ...updates })
          .onDuplicateKeyUpdate({ set: updates });
      } else if (hasRelational) {
        // Only relational entities in this save: still ensure the row exists
        // and bump updatedAt (the client's offline-merge logic dates server
        // writes by it).
        await db
          .insert(userAppData)
          .values({ userId: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
      }

      // The relational writes are now AUTHORITATIVE — a failure must surface
      // to the client as a failed save (it shows its sync-failed toast and
      // retains the dirty flag), not be swallowed like the dual-write era.
      // Full-array saves now only come from pre-226 clients (current clients
      // use syncEntity): atomic, and an obvious wipe is refused.
      if (input.tasks !== undefined) await mirrorTasksToRelational(db, ctx.user.id, input.tasks, { guard: true });
      if (input.notes !== undefined) await mirrorNotesToRelational(db, ctx.user.id, input.notes, { guard: true });
      if (input.ideas !== undefined) await mirrorIdeasToRelational(db, ctx.user.id, input.ideas, { guard: true });

      return { ok: true };
    }),

  /**
   * Per-item sync for tasks / notes / ideas (build -226). The client sends only
   * the items it changed and the ids it removed, each with the hash of the
   * item as it last saw it on the server; see applyEntityChanges. Replaces the
   * whole-list save, which let a stale device erase other devices' work.
   */
  syncEntity: protectedProcedure
    .input(z.object({
      kind: z.enum(['tasks', 'notes', 'ideas']),
      upserts: z.array(z.object({ id: z.string().min(1).max(64), raw: z.string().max(20_000_000), baseHash: z.string().max(16).nullable().optional() })).max(5000),
      deletes: z.array(z.object({ id: z.string().min(1).max(64), baseHash: z.string().max(16).nullable().optional() })).max(5000),
      order: z.array(z.string().max(64)).max(20000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error('db unavailable');
      const r = await applyEntityChanges(db, ctx.user.id, input.kind, input);
      return { ok: true as const, ...r };
    }),

  /** Just tasks / notes / ideas (in list order) — the light refresh a tab runs when it regains focus. */
  loadEntities: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    return {
      tasks: (await readTasks(db, ctx.user.id)).tasks,
      notes: (await readNotes(db, ctx.user.id)).notes,
      ideas: (await readIdeas(db, ctx.user.id)).ideas,
    };
  }),

  /**
   * Relational row counts per entity, for Settings → Admin → Migration Health.
   * Step 3b (migration 0052, 2026-10-14) dropped the frozen blob columns, so
   * there is no blob side to compare any more. The backfill*Relational
   * endpoints went with them: they copied the frozen July snapshot OVER the
   * live table — a data-loss trap once Step 3a had made the table the store.
   */
  tasksRelationalStatus: protectedProcedure.query(async ({ ctx }) => _relStatus(ctx.user.id, tasksTable)),
  notesRelationalStatus: protectedProcedure.query(async ({ ctx }) => _relStatus(ctx.user.id, notesTable)),
  ideasRelationalStatus: protectedProcedure.query(async ({ ctx }) => _relStatus(ctx.user.id, ideasTable)),

  /**
   * OWNER-ONLY full export of user_app_data — the prescribed backup before
   * Step 3 (dropping the legacy blob columns, which is irreversible). Returns
   * every row with all blob columns verbatim; the client downloads it as a
   * JSON file. Strictly read-only. Gated to the workspace owner (not plain
   * admins) because it contains every member's raw data.
   */
  exportUserAppDataBackup: adminProcedure.query(async ({ ctx }) => {
    const owner = await isOwnerCtxUser(ctx.user as any);
    if (!owner) return { ok: false as const, error: 'Workspace owner only.' };
    const db = await getDb();
    if (!db) return { ok: false as const, error: 'db unavailable' };
    // Every table (tasks, notes and ideas have lived in their own tables since
    // 0052 — the old export of user_app_data alone left them out). Secret
    // columns are redacted; see server/_core/backup.ts.
    const { dumpAllTables } = await import('../_core/backup');
    const dump = await dumpAllTables(db);
    const rowCount = Object.values(dump.tables).reduce((n, t) => n + t.count, 0);
    return {
      ok: true as const,
      exportedAt: dump.createdAt,
      tableCount: Object.keys(dump.tables).length,
      rowCount,
      note: 'Secret values (passwords, tokens, API keys) are redacted: after a restore, reconnect integrations and use Forgot password to sign in.',
      tables: dump.tables,
    };
  }),

  /** Last automatic backup (owner only). */
  backupStatus: adminProcedure.query(async ({ ctx }) => {
    if (!(await isOwnerCtxUser(ctx.user as any))) return { ok: false as const, error: 'Workspace owner only.' };
    const { backupStatus } = await import('../_core/backup');
    return { ok: true as const, last: await backupStatus() };
  }),

  /** Run an encrypted, verified backup to private storage now (owner only). */
  runBackupNow: adminProcedure.mutation(async ({ ctx }) => {
    if (!(await isOwnerCtxUser(ctx.user as any))) return { ok: false as const, error: 'Workspace owner only.' };
    const { runBackup } = await import('../_core/backup');
    const r = await runBackup('manual');
    return { ok: r.ok, last: r, error: r.error };
  }),

  /**
   * Phase 1 / step 2 (team-visibility): one-shot backfill of the userId-based
   * createdById / assigneeId columns (migration 0045) from the existing data.
   *   - tasks: createdById ← resolve(createdBy name) ?? row owner;
   *            assigneeId  ← resolve(assignedTo name) ?? null
   *   - notes: createdById ← row owner (notes have no createdBy column);
   *            assigneeId  ← null
   * Admin-only, idempotent (safe to re-run). Returns counts. If it throws, the
   * 0045 columns almost certainly didn't get created — the error says so.
   */
  /**
   * Team-visibility read augmentation (Phase 1, step 2c). Tasks this user
   * should SEE but does not OWN (they live in another member's blob):
   *   - regular member / admin → tasks ASSIGNED to them by someone else
   *     (assigneeId==me, owned by another user);
   *   - WORKSPACE OWNER only  → every other member's tasks (full visibility).
   *     (Was any-admin; that exposed the owner's whole workspace to invited
   *     admins — see isOwnerCtxUser.)
   * The user's OWN tasks come through the normal appData.load path. Each row is
   * tagged `_sharedFromUserId` + `_readOnly` so the client renders it read-only
   * and excludes it from the user's own blob on save. Resilient: any failure
   * returns an empty list (the app falls back to just the user's own tasks).
   */
  sharedTasksForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, tasks: [] as any[] };
    try {
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      // A task is "assigned to me" if I'm in the multi-assignee array /
      // primaryAssigneeId stored in raw, or the legacy `assignedTo` NAME
      // resolves unambiguously to me. The relational `assigneeId` column is
      // only a derived mirror of those — it is NOT trusted on its own, because
      // a stale stamp from a display-name collision (owner + demo account both
      // "Idris Grant") once handed 71 of the owner's personal tasks to the demo
      // account. Cross-checking against raw makes the read correct even before
      // the column is re-stamped.
      const idMap = await _resolveUserIdMap();
      const isMineAssigned = (r: any): boolean => {
        try {
          const t = JSON.parse(r.raw || '{}');
          if (Array.isArray(t.assignees) && t.assignees.map((x: any) => Number(x)).includes(ctx.user.id)) return true;
          if (t.primaryAssigneeId != null && Number(t.primaryAssigneeId) === ctx.user.id) return true;
          const nm = t.assignedTo ? String(t.assignedTo).trim().toLowerCase() : "";
          if (nm && idMap.get(nm) === ctx.user.id) return true;
          // Column agrees AND raw does not name someone else: legacy rows that
          // were stamped from an email rather than a name.
          if (r.assigneeId === ctx.user.id && !nm && !Array.isArray(t.assignees)) return true;
        } catch {
          if (r.assigneeId === ctx.user.id) return true;
        }
        return false;
      };
      // Tasks owned by OTHERS: assigned to me (any assignee), or all if OWNER.
      const sharedRows = owner
        ? await db.select().from(tasksTable).where(ne(tasksTable.userId, ctx.user.id))
        : (await db.select().from(tasksTable).where(ne(tasksTable.userId, ctx.user.id))).filter(isMineAssigned);
      // MY OWN tasks delegated to someone else (assignee set and != me; SQL
      // `!=` already excludes the null/unassigned rows).
      const delegatedRows = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, ctx.user.id), ne(tasksTable.assigneeId, ctx.user.id)));
      // External-origin tasks (Nifty/LSI, Smartsheet/CF) must NEVER appear in the
      // shared view — they render through their own external-source path (source
      // chip + annotate modal). If such a task ever lands in a native blob and
      // gets mirrored here, skip it so it can't masquerade as a "shared" task.
      const isExternalOrigin = (t: any) => !!(t && (
        t.externalId || t._externalId ||
        ['nifty', 'smartsheet'].includes(String(t.source || t._source || '').toLowerCase()) ||
        /nifty|smartsheet/i.test(String(t._url || t.url || ''))
      ));
      const mapRow = (r: any, delegated: boolean) => {
        let t: any = null;
        try { t = JSON.parse(r.raw); } catch { return null; }
        if (!t) return null;
        if (isExternalOrigin(t)) return null;
        t._sharedFromUserId = r.userId;
        t._readOnly = true;
        if (delegated) { t._delegated = true; t._assigneeName = r.assignedTo || ''; }
        return t;
      };
      const tasks = [...sharedRows.map((r: any) => mapRow(r, false)), ...delegatedRows.map((r: any) => mapRow(r, true))].filter(Boolean);
      return { ok: true as const, admin, tasks };
    } catch (e: any) {
      return { ok: false as const, tasks: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility for PROJECTS. Projects are blob-only (no relational table),
   * so we scan every member's `projects` blob (small data) and return projects
   * ASSIGNED to me (project.assignee/assignedTo name matches my account) — or,
   * for admins, all other members' projects. Tagged _sharedFromUserId +
   * _readOnly. Resilient: any failure returns an empty list.
   */
  sharedProjectsForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, projects: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const me = users.find(u => u.id === ctx.user.id);
      const myKeys = new Set(_myAssigneeKeys(users, me));
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      const rows = await db.select({ userId: userAppData.userId, projects: userAppData.projects }).from(userAppData);
      const out: any[] = [];
      const meId = ctx.user.id;
      const assignedToMe = (p: any) => (Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).includes(meId)) || (p.primaryAssigneeId != null && Number(p.primaryAssigneeId) === meId);
      const assignedToOthers = (p: any) => Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).some((n: number) => n && n !== meId);
      for (const r of rows) {
        let arr: any;
        try { arr = JSON.parse(r.projects || '[]'); } catch { continue; }
        if (!Array.isArray(arr)) continue;
        if (r.userId === ctx.user.id) {
          // MY OWN projects that I've assigned to someone else → "delegated".
          // (My own un-delegated projects come through the normal load path.)
          for (const p of arr) {
            if (!p) continue;
            const assigneeName = p.assignee || p.assignedTo || '';
            const assignee = String(assigneeName).trim().toLowerCase();
            if ((assignee && !myKeys.has(assignee)) || assignedToOthers(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true, _delegated: true, _assigneeName: assigneeName });
            }
          }
        } else {
          // OTHER members' projects: assigned to me, or all of them if I'm admin.
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignee || p.assignedTo || '').trim().toLowerCase();
            if (owner || (assignee && myKeys.has(assignee)) || assignedToMe(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true });
            }
          }
        }
      }
      return { ok: true as const, admin, projects: out };
    } catch (e: any) {
      return { ok: false as const, projects: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility for PROGRAMS (portfolio roll-ups; blob-only array, same model
   * as projects). Returns programs assigned to me (any assignee / primary) — or,
   * for admins, all other members' programs — plus my own delegated ones.
   */
  sharedProgramsForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, programs: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const me = users.find(u => u.id === ctx.user.id);
      const myKeys = new Set(_myAssigneeKeys(users, me));
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      const rows = await db.select({ userId: userAppData.userId, programs: userAppData.programs }).from(userAppData);
      const out: any[] = [];
      const meId = ctx.user.id;
      const assignedToMe = (p: any) => (Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).includes(meId)) || (p.primaryAssigneeId != null && Number(p.primaryAssigneeId) === meId);
      const assignedToOthers = (p: any) => Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).some((n: number) => n && n !== meId);
      for (const r of rows) {
        let arr: any;
        try { arr = JSON.parse(r.programs || '[]'); } catch { continue; }
        if (!Array.isArray(arr)) continue;
        if (r.userId === ctx.user.id) {
          for (const p of arr) {
            if (!p) continue;
            const assigneeName = p.assignedTo || '';
            const assignee = String(assigneeName).trim().toLowerCase();
            if ((assignee && !myKeys.has(assignee)) || assignedToOthers(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true, _delegated: true, _assigneeName: assigneeName });
            }
          }
        } else {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if (owner || (assignee && myKeys.has(assignee)) || assignedToMe(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true });
            }
          }
        }
      }
      return { ok: true as const, admin, programs: out };
    } catch (e: any) {
      return { ok: false as const, programs: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility: edit a shared/delegated PROGRAM. Admin / owner / assignee.
   * Patch: name/status/description + multi-assignee + Primary Responsible.
   */
  updateSharedProgram: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      programId: z.string().min(1),
      patch: z.object({
        name: z.string().max(200).optional(),
        status: z.string().max(40).optional(),
        description: z.string().optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const [appRow] = await db.select({ programs: userAppData.programs }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !appRow.programs) return { ok: false as const, error: 'program not found' };
        let arr: any;
        try { arr = JSON.parse(appRow.programs); } catch { return { ok: false as const, error: 'bad data' }; }
        if (!Array.isArray(arr)) return { ok: false as const, error: 'bad data' };
        const prog = arr.find((x: any) => x && String(x.id) === input.programId);
        if (!prog) return { ok: false as const, error: 'program not found' };
        let allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id
          || (Array.isArray(prog.assignees) && prog.assignees.map((x: any) => Number(x)).includes(ctx.user.id));
        if (!allowed) {
          const { adminListAllUsers } = await import("../db");
          const _all = await adminListAllUsers();
          const me = _all.find(u => u.id === ctx.user.id);
          const myKeys = _myAssigneeKeys(_all, me);
          const cur = String(prog.assignedTo || '').trim().toLowerCase();
          allowed = !!cur && myKeys.includes(cur);
        }
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        const q = input.patch;
        if (q.name != null) prog.name = q.name;
        if (q.status != null) prog.status = q.status;
        if (q.description != null) prog.description = q.description;
        if (q.assignees != null) prog.assignees = q.assignees;
        if (q.assigneeNames != null) prog.assigneeNames = q.assigneeNames;
        if (q.primaryAssigneeId !== undefined) prog.primaryAssigneeId = q.primaryAssigneeId;
        if (q.primaryAssigneeId != null && Array.isArray(q.assignees) && Array.isArray(q.assigneeNames)) {
          const idx = q.assignees.indexOf(q.primaryAssigneeId);
          if (idx >= 0) prog.assignedTo = q.assigneeNames[idx];
        } else if (q.assignedTo != null) prog.assignedTo = q.assignedTo;
        await db.update(userAppData).set({ programs: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility for MIND MAPS (blob-only array; made shareable in migration
   * 0046). Same model as projects/programs — assignees + Primary Responsible.
   */
  sharedMindMapsForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, mindmaps: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const me = users.find(u => u.id === ctx.user.id);
      const myKeys = new Set(_myAssigneeKeys(users, me));
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      const rows = await db.select({ userId: userAppData.userId, mindmaps: userAppData.mindmaps }).from(userAppData);
      const out: any[] = [];
      const meId = ctx.user.id;
      const assignedToMe = (p: any) => (Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).includes(meId)) || (p.primaryAssigneeId != null && Number(p.primaryAssigneeId) === meId);
      const assignedToOthers = (p: any) => Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).some((n: number) => n && n !== meId);
      for (const r of rows) {
        let arr: any;
        try { arr = JSON.parse((r as any).mindmaps || '[]'); } catch { continue; }
        if (!Array.isArray(arr)) continue;
        if (r.userId === ctx.user.id) {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if ((assignee && !myKeys.has(assignee)) || assignedToOthers(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true, _delegated: true, _assigneeName: p.assignedTo || '' });
            }
          }
        } else {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if (owner || (assignee && myKeys.has(assignee)) || assignedToMe(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true });
            }
          }
        }
      }
      return { ok: true as const, admin, mindmaps: out };
    } catch (e: any) {
      return { ok: false as const, mindmaps: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility: edit a shared/delegated MIND MAP. Admin / owner / assignee.
   * Patch: name + multi-assignee + Primary Responsible (mind-map graph data is
   * the owner's; this only changes metadata + assignment).
   */
  updateSharedMindMap: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      mindmapId: z.string().min(1),
      patch: z.object({
        name: z.string().max(200).optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const [appRow] = await db.select({ mindmaps: userAppData.mindmaps }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !(appRow as any).mindmaps) return { ok: false as const, error: 'mind map not found' };
        let arr: any;
        try { arr = JSON.parse((appRow as any).mindmaps); } catch { return { ok: false as const, error: 'bad data' }; }
        if (!Array.isArray(arr)) return { ok: false as const, error: 'bad data' };
        const mm = arr.find((x: any) => x && String(x.id) === input.mindmapId);
        if (!mm) return { ok: false as const, error: 'mind map not found' };
        let allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id
          || (Array.isArray(mm.assignees) && mm.assignees.map((x: any) => Number(x)).includes(ctx.user.id));
        if (!allowed) {
          const { adminListAllUsers } = await import("../db");
          const _all = await adminListAllUsers();
          const me = _all.find(u => u.id === ctx.user.id);
          const myKeys = _myAssigneeKeys(_all, me);
          const cur = String(mm.assignedTo || '').trim().toLowerCase();
          allowed = !!cur && myKeys.includes(cur);
        }
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        const q = input.patch;
        if (q.name != null) { mm.name = q.name; if (mm.title !== undefined) mm.title = q.name; }
        if (q.assignees != null) mm.assignees = q.assignees;
        if (q.assigneeNames != null) mm.assigneeNames = q.assigneeNames;
        if (q.primaryAssigneeId !== undefined) mm.primaryAssigneeId = q.primaryAssigneeId;
        if (q.primaryAssigneeId != null && Array.isArray(q.assignees) && Array.isArray(q.assigneeNames)) {
          const idx = q.assignees.indexOf(q.primaryAssigneeId);
          if (idx >= 0) mm.assignedTo = q.assigneeNames[idx];
        } else if (q.assignedTo != null) mm.assignedTo = q.assignedTo;
        await db.update(userAppData).set({ mindmaps: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility for SHEETS (Smartsheet-like spreadsheets; blob-only array,
   * made shareable in migration 0047). Same model as mind maps — assignees +
   * Primary Responsible. Unlike mind maps, shared sheets are CO-EDITABLE (the
   * grid data itself can be patched by an assignee), so members can work the
   * sheet together.
   */
  sharedSheetsForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, sheets: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const me = users.find(u => u.id === ctx.user.id);
      const myKeys = new Set(_myAssigneeKeys(users, me));
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      const rows = await db.select({ userId: userAppData.userId, sheets: userAppData.sheets }).from(userAppData);
      const out: any[] = [];
      const meId = ctx.user.id;
      const assignedToMe = (p: any) => (Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).includes(meId)) || (p.primaryAssigneeId != null && Number(p.primaryAssigneeId) === meId);
      const assignedToOthers = (p: any) => Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).some((n: number) => n && n !== meId);
      for (const r of rows) {
        let arr: any;
        try { arr = JSON.parse((r as any).sheets || '[]'); } catch { continue; }
        if (!Array.isArray(arr)) continue;
        if (r.userId === ctx.user.id) {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if ((assignee && !myKeys.has(assignee)) || assignedToOthers(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: false, _delegated: true, _assigneeName: p.assignedTo || '' });
            }
          }
        } else {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if (owner || (assignee && myKeys.has(assignee)) || assignedToMe(p) || p.shareAll === true) {
              // 'view' shareMode makes the sheet read-only for recipients
              // (admins keep their full-edit powers; owner sees all).
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: !admin && effShareMode(p, 'edit') === 'view' });
            }
          }
        }
      }
      return { ok: true as const, admin, sheets: out };
    } catch (e: any) {
      return { ok: false as const, sheets: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility: edit a shared/delegated SHEET. Admin / owner / assignee may
   * patch the assignment metadata AND the grid contents (columns + rows), so a
   * sheet is genuinely collaborative. Writes back into the owner's blob.
   */
  updateSharedSheet: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      sheetId: z.string().min(1),
      patch: z.object({
        title: z.string().max(200).optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
        columns: z.array(z.any()).optional(),
        rows: z.array(z.any()).optional(),
        theme: z.any().optional(),
        icon: z.string().max(16).optional(),
        color: z.string().max(32).optional(),
        shareAll: z.boolean().optional(),
        shareMode: z.enum(['view', 'edit']).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const [appRow] = await db.select({ sheets: userAppData.sheets }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !(appRow as any).sheets) return { ok: false as const, error: 'sheet not found' };
        let arr: any;
        try { arr = JSON.parse((appRow as any).sheets); } catch { return { ok: false as const, error: 'bad data' }; }
        if (!Array.isArray(arr)) return { ok: false as const, error: 'bad data' };
        const sh = arr.find((x: any) => x && String(x.id) === input.sheetId);
        if (!sh) return { ok: false as const, error: 'sheet not found' };
        const admin = isAdminUser(ctx.user as any);
        const isItemOwner = input.ownerUserId === ctx.user.id;
        let isAssignee = Array.isArray(sh.assignees) && sh.assignees.map((x: any) => Number(x)).includes(ctx.user.id);
        if (!isAssignee) {
          const { adminListAllUsers } = await import("../db");
          const _all = await adminListAllUsers();
          const me = _all.find(u => u.id === ctx.user.id);
          const myKeys = _myAssigneeKeys(_all, me);
          const cur = String(sh.assignedTo || '').trim().toLowerCase();
          isAssignee = !!cur && myKeys.includes(cur);
        }
        if (!(admin || isItemOwner || isAssignee || sh.shareAll === true)) return { ok: false as const, error: 'not authorized' };
        const q = input.patch;
        // Content edits require 'edit' permission (owner/admin always may).
        const hasContent = q.title != null || q.icon != null || q.color != null || q.theme !== undefined || q.columns != null || q.rows != null;
        if (hasContent && !(admin || isItemOwner) && effShareMode(sh, 'edit') === 'view')
          return { ok: false as const, error: 'view-only: the owner shared this sheet without edit permission' };
        // Assignment changes stay with owner/admin/assignees (a share-all
        // viewer can't reassign); share settings are owner/admin only.
        const hasAssign = q.assignees != null || q.assigneeNames != null || q.primaryAssigneeId !== undefined || q.assignedTo != null;
        if (hasAssign && !(admin || isItemOwner || isAssignee)) return { ok: false as const, error: 'not authorized to change assignment' };
        if ((q.shareAll !== undefined || q.shareMode !== undefined) && !(admin || isItemOwner))
          return { ok: false as const, error: 'only the owner can change share settings' };
        if (q.shareAll !== undefined) sh.shareAll = q.shareAll;
        if (q.shareMode !== undefined) sh.shareMode = q.shareMode;
        if (q.title != null) sh.title = q.title;
        if (q.icon != null) sh.icon = q.icon;
        if (q.color != null) sh.color = q.color;
        if (q.theme !== undefined) sh.theme = q.theme;
        if (q.columns != null) sh.columns = q.columns;
        if (q.rows != null) sh.rows = q.rows;
        if (q.assignees != null) sh.assignees = q.assignees;
        if (q.assigneeNames != null) sh.assigneeNames = q.assigneeNames;
        if (q.primaryAssigneeId !== undefined) sh.primaryAssigneeId = q.primaryAssigneeId;
        if (q.primaryAssigneeId != null && Array.isArray(q.assignees) && Array.isArray(q.assigneeNames)) {
          const idx = q.assignees.indexOf(q.primaryAssigneeId);
          if (idx >= 0) sh.assignedTo = q.assigneeNames[idx];
        } else if (q.assignedTo != null) sh.assignedTo = q.assignedTo;
        sh.updatedAt = new Date().toISOString();
        await db.update(userAppData).set({ sheets: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility for DECKS (slide presentations; blob-only array, migration
   * 0048). Same shareable + CO-EDITABLE model as sheets — assignees + Primary
   * Responsible, and the slides themselves can be patched by an assignee.
   */
  sharedDecksForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, decks: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const me = users.find(u => u.id === ctx.user.id);
      const myKeys = new Set(_myAssigneeKeys(users, me));
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      const rows = await db.select({ userId: userAppData.userId, decks: userAppData.decks }).from(userAppData);
      const out: any[] = [];
      const meId = ctx.user.id;
      const assignedToMe = (p: any) => (Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).includes(meId)) || (p.primaryAssigneeId != null && Number(p.primaryAssigneeId) === meId);
      const assignedToOthers = (p: any) => Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).some((n: number) => n && n !== meId);
      for (const r of rows) {
        let arr: any;
        try { arr = JSON.parse((r as any).decks || '[]'); } catch { continue; }
        if (!Array.isArray(arr)) continue;
        if (r.userId === ctx.user.id) {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if ((assignee && !myKeys.has(assignee)) || assignedToOthers(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: false, _delegated: true, _assigneeName: p.assignedTo || '' });
            }
          }
        } else {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if (owner || (assignee && myKeys.has(assignee)) || assignedToMe(p) || p.shareAll === true) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: !admin && effShareMode(p, 'edit') === 'view' });
            }
          }
        }
      }
      return { ok: true as const, admin, decks: out };
    } catch (e: any) {
      return { ok: false as const, decks: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility: edit a shared/delegated DECK. Admin / owner / assignee may
   * patch assignment metadata AND the slides, so a deck is collaborative.
   */
  updateSharedDeck: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      deckId: z.string().min(1),
      patch: z.object({
        title: z.string().max(200).optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
        slides: z.array(z.any()).optional(),
        theme: z.any().optional(),
        icon: z.string().max(16).optional(),
        color: z.string().max(32).optional(),
        shareAll: z.boolean().optional(),
        shareMode: z.enum(['view', 'edit']).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const [appRow] = await db.select({ decks: userAppData.decks }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !(appRow as any).decks) return { ok: false as const, error: 'deck not found' };
        let arr: any;
        try { arr = JSON.parse((appRow as any).decks); } catch { return { ok: false as const, error: 'bad data' }; }
        if (!Array.isArray(arr)) return { ok: false as const, error: 'bad data' };
        const dk = arr.find((x: any) => x && String(x.id) === input.deckId);
        if (!dk) return { ok: false as const, error: 'deck not found' };
        const admin = isAdminUser(ctx.user as any);
        const isItemOwner = input.ownerUserId === ctx.user.id;
        let isAssignee = Array.isArray(dk.assignees) && dk.assignees.map((x: any) => Number(x)).includes(ctx.user.id);
        if (!isAssignee) {
          const { adminListAllUsers } = await import("../db");
          const _all = await adminListAllUsers();
          const me = _all.find(u => u.id === ctx.user.id);
          const myKeys = _myAssigneeKeys(_all, me);
          const cur = String(dk.assignedTo || '').trim().toLowerCase();
          isAssignee = !!cur && myKeys.includes(cur);
        }
        if (!(admin || isItemOwner || isAssignee || dk.shareAll === true)) return { ok: false as const, error: 'not authorized' };
        const q = input.patch;
        const hasContent = q.title != null || q.icon != null || q.color != null || q.theme !== undefined || q.slides != null;
        if (hasContent && !(admin || isItemOwner) && effShareMode(dk, 'edit') === 'view')
          return { ok: false as const, error: 'view-only: the owner shared this deck without edit permission' };
        const hasAssign = q.assignees != null || q.assigneeNames != null || q.primaryAssigneeId !== undefined || q.assignedTo != null;
        if (hasAssign && !(admin || isItemOwner || isAssignee)) return { ok: false as const, error: 'not authorized to change assignment' };
        if ((q.shareAll !== undefined || q.shareMode !== undefined) && !(admin || isItemOwner))
          return { ok: false as const, error: 'only the owner can change share settings' };
        if (q.shareAll !== undefined) dk.shareAll = q.shareAll;
        if (q.shareMode !== undefined) dk.shareMode = q.shareMode;
        if (q.title != null) dk.title = q.title;
        if (q.icon != null) dk.icon = q.icon;
        if (q.color != null) dk.color = q.color;
        if (q.theme !== undefined) dk.theme = q.theme;
        if (q.slides != null) dk.slides = q.slides;
        if (q.assignees != null) dk.assignees = q.assignees;
        if (q.assigneeNames != null) dk.assigneeNames = q.assigneeNames;
        if (q.primaryAssigneeId !== undefined) dk.primaryAssigneeId = q.primaryAssigneeId;
        if (q.primaryAssigneeId != null && Array.isArray(q.assignees) && Array.isArray(q.assigneeNames)) {
          const idx = q.assignees.indexOf(q.primaryAssigneeId);
          if (idx >= 0) dk.assignedTo = q.assigneeNames[idx];
        } else if (q.assignedTo != null) dk.assignedTo = q.assignedTo;
        dk.updatedAt = new Date().toISOString();
        await db.update(userAppData).set({ decks: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility for the MONEY page (personal finance). The finance blob
   * is ONE OBJECT per user (accounts/transactions/budgets/bills/goals) with
   * a `share` block {assignees, assigneeNames, primaryAssigneeId, shareAll,
   * shareMode}. Deliberately NOT owner/admin-visible-by-default like other
   * entities — finance is sensitive, so ONLY explicit shares (assignee or
   * shareAll) are returned, and there is no admin override on writes.
   * shareMode defaults to 'view' here (the safe default for money).
   */
  sharedFinanceForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, budgets: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const rows = await db.select({ userId: userAppData.userId, finance: userAppData.finance }).from(userAppData);
      const meId = ctx.user.id;
      const out: any[] = [];
      for (const r of rows) {
        if (r.userId === meId) continue;
        let fin: any; try { fin = JSON.parse((r as any).finance || 'null'); } catch { continue; }
        if (!fin || typeof fin !== 'object') continue;
        const sh = fin.share || {};
        const mine = (Array.isArray(sh.assignees) && sh.assignees.map((x: any) => Number(x)).includes(meId)) || sh.shareAll === true;
        if (!mine) continue;
        const u = users.find(x => x.id === r.userId);
        out.push({ ownerUserId: r.userId, ownerName: (u && (u.name || u.email)) || ('user ' + r.userId), finance: fin, _readOnly: effShareMode(sh, 'view') === 'view' });
      }
      return { ok: true as const, budgets: out };
    } catch (e: any) {
      return { ok: false as const, budgets: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Co-edit a budget shared with you. Whole-object replace (the Money client
   * works on the full object), EXCEPT the owner's `share` block, which is
   * preserved unless the caller IS the owner — an edit-recipient can't grant
   * themselves different permissions or reassign the share.
   */
  updateSharedFinance: protectedProcedure
    // baseRev: the budget revision the editor's copy was loaded at. A write
    // from an older copy is refused and the current budget is sent back, so a
    // stale co-editor can't wipe newer synced transactions or paid bills.
    .input(z.object({ ownerUserId: z.number().int(), finance: z.string().max(4000000), baseRev: z.number().int().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const [row] = await db.select({ finance: userAppData.finance }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!row || !(row as any).finance) return { ok: false as const, error: 'budget not found' };
        let cur: any; try { cur = JSON.parse((row as any).finance); } catch { return { ok: false as const, error: 'bad data' }; }
        const sh = (cur && cur.share) || {};
        const meId = ctx.user.id;
        const isItemOwner = input.ownerUserId === meId;
        const isAssignee = Array.isArray(sh.assignees) && sh.assignees.map((x: any) => Number(x)).includes(meId);
        if (!(isItemOwner || isAssignee || sh.shareAll === true)) return { ok: false as const, error: 'not authorized' };
        if (!isItemOwner && effShareMode(sh, 'view') === 'view')
          return { ok: false as const, error: 'view-only: the owner shared this budget without edit permission' };
        let next: any; try { next = JSON.parse(input.finance); } catch { return { ok: false as const, error: 'bad payload' }; }
        if (!next || typeof next !== 'object' || Array.isArray(next)) return { ok: false as const, error: 'bad payload' };
        if (!isItemOwner) next.share = cur.share;
        const curRev = Number(cur._rev) || 0;
        if (input.baseRev != null && Number(input.baseRev) !== curRev) {
          return { ok: false as const, conflict: true as const, error: 'This budget changed since you opened it.', finance: cur };
        }
        next._rev = curRev + 1;
        await db.update(userAppData).set({ finance: JSON.stringify(next) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const, rev: next._rev };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility for REPORTS (saved reports live nested in prefs.savedReports,
   * not a top-level column — so these endpoints read/patch the prefs blob).
   */
  sharedReportsForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, reports: [] as any[] };
    try {
      const { adminListAllUsers } = await import("../db");
      const users = await adminListAllUsers();
      const me = users.find(u => u.id === ctx.user.id);
      const myKeys = new Set(_myAssigneeKeys(users, me));
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const owner = await isOwnerCtxUser(ctx.user as any);
      const rows = await db.select({ userId: userAppData.userId, prefs: userAppData.prefs }).from(userAppData);
      const out: any[] = [];
      const meId = ctx.user.id;
      const assignedToMe = (p: any) => (Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).includes(meId)) || (p.primaryAssigneeId != null && Number(p.primaryAssigneeId) === meId);
      const assignedToOthers = (p: any) => Array.isArray(p.assignees) && p.assignees.map((x: any) => Number(x)).some((n: number) => n && n !== meId);
      for (const r of rows) {
        let prefs: any;
        try { prefs = JSON.parse(r.prefs || '{}'); } catch { continue; }
        const arr = Array.isArray(prefs.savedReports) ? prefs.savedReports : [];
        if (r.userId === ctx.user.id) {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if ((assignee && !myKeys.has(assignee)) || assignedToOthers(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true, _delegated: true, _assigneeName: p.assignedTo || '' });
            }
          }
        } else {
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignedTo || '').trim().toLowerCase();
            if (owner || (assignee && myKeys.has(assignee)) || assignedToMe(p)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true });
            }
          }
        }
      }
      return { ok: true as const, admin, reports: out };
    } catch (e: any) {
      return { ok: false as const, reports: [] as any[], error: String(e?.message || e) };
    }
  }),

  updateSharedReport: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      reportId: z.string().min(1),
      patch: z.object({
        name: z.string().max(200).optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const [appRow] = await db.select({ prefs: userAppData.prefs }).from(userAppData).where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !appRow.prefs) return { ok: false as const, error: 'report not found' };
        let prefs: any;
        try { prefs = JSON.parse(appRow.prefs); } catch { return { ok: false as const, error: 'bad data' }; }
        const arr = Array.isArray(prefs.savedReports) ? prefs.savedReports : [];
        const rep = arr.find((x: any) => x && String(x.id) === input.reportId);
        if (!rep) return { ok: false as const, error: 'report not found' };
        let allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id
          || (Array.isArray(rep.assignees) && rep.assignees.map((x: any) => Number(x)).includes(ctx.user.id));
        if (!allowed) {
          const { adminListAllUsers } = await import("../db");
          const _all = await adminListAllUsers();
          const me = _all.find(u => u.id === ctx.user.id);
          const myKeys = _myAssigneeKeys(_all, me);
          const cur = String(rep.assignedTo || '').trim().toLowerCase();
          allowed = !!cur && myKeys.includes(cur);
        }
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        const q = input.patch;
        if (q.name != null) rep.name = q.name;
        if (q.assignees != null) rep.assignees = q.assignees;
        if (q.assigneeNames != null) rep.assigneeNames = q.assigneeNames;
        if (q.primaryAssigneeId !== undefined) rep.primaryAssigneeId = q.primaryAssigneeId;
        if (q.primaryAssigneeId != null && Array.isArray(q.assignees) && Array.isArray(q.assigneeNames)) {
          const idx = q.assignees.indexOf(q.primaryAssigneeId);
          if (idx >= 0) rep.assignedTo = q.assigneeNames[idx];
        } else if (q.assignedTo != null) rep.assignedTo = q.assignedTo;
        prefs.savedReports = arr;
        await db.update(userAppData).set({ prefs: JSON.stringify(prefs) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  transferReportOwnership: adminProcedure
    .input(z.object({ ownerUserId: z.number().int(), reportId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      if (input.ownerUserId === ctx.user.id) return { ok: false as const, error: 'You already own this report.' };
      try {
        const readPrefs = async (uid: number): Promise<any> => {
          const [r] = await db.select({ prefs: userAppData.prefs }).from(userAppData).where(eq(userAppData.userId, uid)).limit(1);
          try { return JSON.parse((r as any)?.prefs || '{}'); } catch { return {}; }
        };
        const ownerPrefs = await readPrefs(input.ownerUserId);
        const ownerArr = Array.isArray(ownerPrefs.savedReports) ? ownerPrefs.savedReports : [];
        const idx = ownerArr.findIndex((x: any) => x && String(x.id) === input.reportId);
        if (idx < 0) return { ok: false as const, error: 'report not found' };
        const item = ownerArr[idx];
        ownerArr.splice(idx, 1);
        const prev: number[] = Array.isArray(item.assignees) ? item.assignees.map((x: any) => Number(x)).filter((n: number) => !isNaN(n)) : [];
        if (!prev.includes(input.ownerUserId)) prev.push(input.ownerUserId);
        item.assignees = prev;
        item._prevOwnerUserId = input.ownerUserId;
        ownerPrefs.savedReports = ownerArr;
        const adminPrefs = await readPrefs(ctx.user.id);
        const adminArr = Array.isArray(adminPrefs.savedReports) ? adminPrefs.savedReports : [];
        if (adminArr.some((x: any) => x && String(x.id) === input.reportId)) item.id = String(item.id) + '-' + ctx.user.id;
        adminArr.push(item);
        adminPrefs.savedReports = adminArr;
        await db.update(userAppData).set({ prefs: JSON.stringify(ownerPrefs) }).where(eq(userAppData.userId, input.ownerUserId));
        await db.update(userAppData).set({ prefs: JSON.stringify(adminPrefs) }).where(eq(userAppData.userId, ctx.user.id));
        return { ok: true as const, newOwnerUserId: ctx.user.id };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  deleteSharedReport: protectedProcedure
    .input(z.object({ ownerUserId: z.number().int(), reportId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        if (!(isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id)) return { ok: false as const, error: 'not authorized' };
        const [appRow] = await db.select({ prefs: userAppData.prefs }).from(userAppData).where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !appRow.prefs) return { ok: true as const };
        let prefs: any;
        try { prefs = JSON.parse(appRow.prefs); } catch { return { ok: false as const, error: 'bad data' }; }
        if (Array.isArray(prefs.savedReports)) {
          prefs.savedReports = prefs.savedReports.filter((x: any) => !(x && String(x.id) === input.reportId));
          await db.update(userAppData).set({ prefs: JSON.stringify(prefs) }).where(eq(userAppData.userId, input.ownerUserId));
        }
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility for NOTES (relational table like tasks). A member (incl.
   * admins) sees notes where they're any assignee; only the WORKSPACE OWNER
   * sees all; plus my own delegated notes.
   */
  sharedNotesForMe: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, notes: [] as any[] };
    try {
      const { isAdminUser } = await import("../_core/access");
      const admin = isAdminUser(ctx.user as any);
      const idMapNotes = await _resolveUserIdMap();
      const isMineAssigned = (r: any): boolean => {
        // Same rule as tasks: raw is the truth, the assigneeId column is a
        // derived mirror that a display-name collision can leave stale.
        try {
          const t = JSON.parse(r.raw || '{}');
          if (t.shareAll === true) return true;
          if (Array.isArray(t.assignees) && t.assignees.map((x: any) => Number(x)).includes(ctx.user.id)) return true;
          if (t.primaryAssigneeId != null && Number(t.primaryAssigneeId) === ctx.user.id) return true;
          const nm = t.assignedTo ? String(t.assignedTo).trim().toLowerCase() : "";
          if (nm && idMapNotes.get(nm) === ctx.user.id) return true;
          if (r.assigneeId === ctx.user.id && !nm && !Array.isArray(t.assignees)) return true;
        } catch {
          if (r.assigneeId === ctx.user.id) return true;
        }
        return false;
      };
      const owner = await isOwnerCtxUser(ctx.user as any);
      const sharedRows = owner
        ? await db.select().from(notesTable).where(ne(notesTable.userId, ctx.user.id))
        : (await db.select().from(notesTable).where(ne(notesTable.userId, ctx.user.id))).filter(isMineAssigned);
      const delegatedRows = await db.select().from(notesTable).where(and(eq(notesTable.userId, ctx.user.id), ne(notesTable.assigneeId, ctx.user.id)));
      const mapRow = (r: any, delegated: boolean) => {
        let t: any = null;
        try { t = JSON.parse(r.raw); } catch { return null; }
        if (!t) return null;
        t._sharedFromUserId = r.userId;
        t._readOnly = true;
        // Notes default to view-only for recipients (legacy behaviour);
        // shareMode 'edit' lets them edit the body. Admins and the note's
        // owner (delegated rows) always can.
        t._canEditBody = admin || delegated || effShareMode(t, 'view') === 'edit';
        if (delegated) { t._delegated = true; t._assigneeName = t.assignedTo || ''; }
        return t;
      };
      const notes = [...sharedRows.map((r: any) => mapRow(r, false)), ...delegatedRows.map((r: any) => mapRow(r, true))].filter(Boolean);
      return { ok: true as const, admin, notes };
    } catch (e: any) {
      return { ok: false as const, notes: [] as any[], error: String(e?.message || e) };
    }
  }),

  /**
   * Team-visibility: edit a shared/delegated NOTE — title + multi-assignee +
   * Primary. Writes the owner's blob AND the relational mirror (assigneeId/raw).
   */
  updateSharedNote: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      noteId: z.string().min(1),
      patch: z.object({
        title: z.string().max(512).optional(),
        bodyHtml: z.string().max(2000000).optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
        shareAll: z.boolean().optional(),
        shareMode: z.enum(['view', 'edit']).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const [row] = await db.select().from(notesTable).where(and(eq(notesTable.userId, input.ownerUserId), eq(notesTable.noteId, input.noteId))).limit(1);
        if (!row) return { ok: false as const, error: 'note not found' };
        const { isAdminUser } = await import("../_core/access");
        let rawAssignees: number[] = [];
        let rawNote: any = {};
        try { rawNote = JSON.parse(row.raw || '{}') || {}; if (Array.isArray(rawNote.assignees)) rawAssignees = rawNote.assignees.map((x: any) => Number(x)).filter((n: number) => !isNaN(n)); } catch {}
        const admin = isAdminUser(ctx.user as any);
        const isItemOwner = row.userId === ctx.user.id;
        const isAssignee = row.assigneeId === ctx.user.id || rawAssignees.includes(ctx.user.id);
        const allowed = admin || isItemOwner || isAssignee || rawNote.shareAll === true;
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        const p = input.patch;
        // Body edits need 'edit' permission (notes default to view-only).
        if (p.bodyHtml != null && !(admin || isItemOwner) && effShareMode(rawNote, 'view') === 'view')
          return { ok: false as const, error: 'view-only: the owner shared this note without edit permission' };
        // A share-all viewer can't reassign; share settings are owner/admin only.
        const hasAssign = p.assignees != null || p.assigneeNames != null || p.primaryAssigneeId !== undefined || p.assignedTo != null;
        if (hasAssign && !(admin || isItemOwner || isAssignee)) return { ok: false as const, error: 'not authorized to change assignment' };
        if ((p.shareAll !== undefined || p.shareMode !== undefined) && !(admin || isItemOwner))
          return { ok: false as const, error: 'only the owner can change share settings' };
        let primaryId: number | null | undefined = undefined;
        let primaryName: string | undefined = p.assignedTo ?? undefined;
        if (p.primaryAssigneeId !== undefined) {
          primaryId = p.primaryAssigneeId;
          if (Array.isArray(p.assignees) && Array.isArray(p.assigneeNames) && p.primaryAssigneeId != null) {
            const idx = p.assignees.indexOf(p.primaryAssigneeId);
            if (idx >= 0) primaryName = p.assigneeNames[idx];
          }
        } else if (p.assignedTo != null) {
          const { adminListAllUsers } = await import("../db");
          const users = await adminListAllUsers();
          const key = p.assignedTo.trim().toLowerCase();
          const u = users.find(x => (x.name && x.name.trim().toLowerCase() === key) || (x.email && x.email.trim().toLowerCase() === key));
          primaryId = u ? u.id : null;
        }
        const applyTo = (t: any) => {
          if (p.title != null) t.title = p.title;
          if (p.bodyHtml != null) { t.bodyHtml = p.bodyHtml; t.updated = new Date().toLocaleString(); }
          if (p.shareAll !== undefined) t.shareAll = p.shareAll;
          if (p.shareMode !== undefined) t.shareMode = p.shareMode;
          if (p.assignees != null) t.assignees = p.assignees;
          if (p.assigneeNames != null) t.assigneeNames = p.assigneeNames;
          if (p.primaryAssigneeId !== undefined) t.primaryAssigneeId = p.primaryAssigneeId;
          if (primaryName !== undefined) t.assignedTo = primaryName;
          else if (p.assignedTo != null) t.assignedTo = p.assignedTo;
        };
        // Step 3a: the relational row IS the store — the blob write that used
        // to happen here is gone (blob columns are frozen pre-3a snapshots).
        let newRaw = row.raw;
        try { const t = JSON.parse(row.raw || '{}'); applyTo(t); newRaw = JSON.stringify(t); } catch {}
        const set: Record<string, unknown> = { raw: newRaw };
        if (p.title != null) set.title = p.title.slice(0, 512);
        if (primaryId !== undefined) set.assigneeId = primaryId ?? null;
        await db.update(notesTable).set(set).where(eq(notesTable.id, row.id));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility: let the ASSIGNEE (or an admin) change the STATUS of a task
   * that lives in another member's blob. Writes back to the owner's JSON blob
   * (source of truth) AND the relational mirror. Status-only — the assignee
   * can't rewrite the owner's title/notes/etc. Authorized by assigneeId.
   */
  updateSharedTaskStatus: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      taskId: z.string().min(1),
      status: z.string().min(1).max(32),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const [row] = await db.select().from(tasksTable)
          .where(and(eq(tasksTable.userId, input.ownerUserId), eq(tasksTable.taskId, input.taskId)))
          .limit(1);
        if (!row) return { ok: false as const, error: 'task not found' };
        const { isAdminUser } = await import("../_core/access");
        const allowed = isAdminUser(ctx.user as any) || row.userId === ctx.user.id || _taskAssignedTo(row, ctx.user.id, await _resolveUserIdMap());
        if (!allowed) return { ok: false as const, error: 'not authorized' };

        const isDone = /done|complete|completed|closed/i.test(input.status);
        const completedAt = isDone ? new Date().toISOString() : null;

        // Step 3a: relational row is the sole store (blob write removed).
        let newRaw = row.raw;
        try {
          const t = JSON.parse(row.raw || '{}');
          t.status = input.status;
          t.completedAt = completedAt;
          newRaw = JSON.stringify(t);
        } catch { /* keep old raw */ }
        await db.update(tasksTable)
          .set({ status: input.status.slice(0, 32), completedAt: completedAt ? completedAt.slice(0, 40) : null, raw: newRaw })
          .where(eq(tasksTable.id, row.id));

        return { ok: true as const, status: input.status };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility: edit a task that lives in another member's blob (or your
   * own delegated task). Authorized by assignee / owner / admin. Applies a
   * field patch (title/status/priority/due/notes) to the owner's JSON blob AND
   * the relational mirror. Only these fields — structural fields stay the
   * owner's.
   */
  updateSharedTask: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      taskId: z.string().min(1),
      patch: z.object({
        title: z.string().max(512).optional(),
        status: z.string().max(32).optional(),
        priority: z.string().max(16).optional(),
        due: z.string().max(32).optional(),
        notes: z.string().optional(),
        assignedTo: z.string().max(255).optional(),
        // Multi-assignee model: full member list + the Primary Responsible.
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const [row] = await db.select().from(tasksTable)
          .where(and(eq(tasksTable.userId, input.ownerUserId), eq(tasksTable.taskId, input.taskId))).limit(1);
        if (!row) return { ok: false as const, error: 'task not found' };
        const { isAdminUser } = await import("../_core/access");
        // Authorized: admin, the relational primary assignee, the owner, OR any
        // member listed in the item's multi-assignee array (parsed from raw).
        let rawAssignees: number[] = [];
        try { const rj = JSON.parse(row.raw || '{}'); if (Array.isArray(rj.assignees)) rawAssignees = rj.assignees.map((x: any) => Number(x)).filter((n: number) => !isNaN(n)); } catch {}
        const allowed = isAdminUser(ctx.user as any) || row.userId === ctx.user.id || rawAssignees.includes(ctx.user.id) || _taskAssignedTo(row, ctx.user.id, await _resolveUserIdMap());
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        const p = input.patch;
        const isDone = p.status != null && /done|complete|completed|closed/i.test(p.status);
        const completedAt = isDone ? new Date().toISOString() : null;
        // Resolve a reassignment (assignedTo name → userId) so visibility moves
        // to the new assignee. Empty string clears the assignment.
        let newAssigneeId: number | null | undefined = undefined;
        if (p.assignedTo != null) {
          if (!p.assignedTo.trim()) { newAssigneeId = null; }
          else {
            const { adminListAllUsers } = await import("../db");
            const users = await adminListAllUsers();
            const key = p.assignedTo.trim().toLowerCase();
            const u = users.find(x => (x.name && x.name.trim().toLowerCase() === key) || (x.email && x.email.trim().toLowerCase() === key));
            newAssigneeId = u ? u.id : null;
          }
        }
        // Multi-assignee: derive the Primary Responsible's id + display name so
        // the legacy single-assignee columns (assigneeId / assignedTo) keep
        // pointing at the primary — existing relational queries still work.
        let primaryId: number | null | undefined = newAssigneeId;
        let primaryName: string | undefined = p.assignedTo ?? undefined;
        if (p.primaryAssigneeId !== undefined) {
          primaryId = p.primaryAssigneeId;
          if (Array.isArray(p.assignees) && Array.isArray(p.assigneeNames) && p.primaryAssigneeId != null) {
            const idx = p.assignees.indexOf(p.primaryAssigneeId);
            if (idx >= 0) primaryName = p.assigneeNames[idx];
          }
        }
        const applyTo = (t: any) => {
          if (p.title != null) t.title = p.title;
          if (p.status != null) { t.status = p.status; t.completedAt = completedAt; }
          if (p.priority != null) t.priority = p.priority;
          if (p.due != null) t.due = p.due;
          if (p.notes != null) t.notes = p.notes;
          if (p.assignees != null) t.assignees = p.assignees;
          if (p.assigneeNames != null) t.assigneeNames = p.assigneeNames;
          if (p.primaryAssigneeId !== undefined) t.primaryAssigneeId = p.primaryAssigneeId;
          if (primaryName !== undefined) t.assignedTo = primaryName;
          else if (p.assignedTo != null) t.assignedTo = p.assignedTo;
        };

        // Step 3a: relational row is the sole store (blob write removed).
        let newRaw = row.raw;
        try { const t = JSON.parse(row.raw || '{}'); applyTo(t); newRaw = JSON.stringify(t); } catch { /* keep old raw */ }
        const set: Record<string, unknown> = { raw: newRaw };
        if (p.title != null) set.title = p.title.slice(0, 512);
        if (p.status != null) { set.status = p.status.slice(0, 32); set.completedAt = completedAt ? completedAt.slice(0, 40) : null; }
        if (p.priority != null) set.priority = p.priority.slice(0, 16);
        if (p.due != null) set.due = p.due.slice(0, 32);
        // Keep the relational single-assignee columns synced to the Primary.
        if (primaryName !== undefined) set.assignedTo = String(primaryName).slice(0, 255);
        else if (p.assignedTo != null) set.assignedTo = p.assignedTo.slice(0, 255);
        if (primaryId !== undefined) set.assigneeId = primaryId ?? null;
        await db.update(tasksTable).set(set).where(eq(tasksTable.id, row.id));

        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility: edit a shared/delegated PROJECT (blob-only, no mirror).
   * Admin / owner / assignee. Patch: name/status/due/desc/assignedTo.
   */
  updateSharedProject: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      projectId: z.string().min(1),
      patch: z.object({
        name: z.string().max(200).optional(),
        status: z.string().max(40).optional(),
        due: z.string().max(40).optional(),
        desc: z.string().optional(),
        assignedTo: z.string().max(255).optional(),
        assignees: z.array(z.number().int()).optional(),
        assigneeNames: z.array(z.string().max(255)).optional(),
        primaryAssigneeId: z.number().int().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const [appRow] = await db.select({ projects: userAppData.projects }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (!appRow || !appRow.projects) return { ok: false as const, error: 'project not found' };
        let arr: any;
        try { arr = JSON.parse(appRow.projects); } catch { return { ok: false as const, error: 'bad data' }; }
        if (!Array.isArray(arr)) return { ok: false as const, error: 'bad data' };
        const proj = arr.find((x: any) => x && String(x.id) === input.projectId);
        if (!proj) return { ok: false as const, error: 'project not found' };
        // Authorize: admin, owner, current assignee (by name/email), or any
        // member in the multi-assignee array.
        let allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id
          || (Array.isArray(proj.assignees) && proj.assignees.map((x: any) => Number(x)).includes(ctx.user.id));
        if (!allowed) {
          const { adminListAllUsers } = await import("../db");
          const _all = await adminListAllUsers();
          const me = _all.find(u => u.id === ctx.user.id);
          const myKeys = _myAssigneeKeys(_all, me);
          const cur = String(proj.assignee || proj.assignedTo || '').trim().toLowerCase();
          allowed = !!cur && myKeys.includes(cur);
        }
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        const q = input.patch;
        if (q.name != null) proj.name = q.name;
        if (q.status != null) proj.status = q.status;
        if (q.due != null) proj.due = q.due;
        if (q.desc != null) proj.desc = q.desc;
        if (q.assignees != null) proj.assignees = q.assignees;
        if (q.assigneeNames != null) proj.assigneeNames = q.assigneeNames;
        if (q.primaryAssigneeId !== undefined) proj.primaryAssigneeId = q.primaryAssigneeId;
        // Keep legacy assignedTo pointed at the Primary Responsible's name.
        if (q.primaryAssigneeId != null && Array.isArray(q.assignees) && Array.isArray(q.assigneeNames)) {
          const idx = q.assignees.indexOf(q.primaryAssigneeId);
          if (idx >= 0) proj.assignedTo = q.assigneeNames[idx];
        } else if (q.assignedTo != null) proj.assignedTo = q.assignedTo;
        await db.update(userAppData).set({ projects: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId));
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Team-visibility: delete a shared item from the owner's blob (+ relational
   * mirror for tasks/notes). ADMIN or OWNER only — destructive.
   */
  deleteSharedItem: protectedProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      kind: z.enum(['tasks', 'projects', 'goals', 'ideas', 'notes', 'programs', 'mindmaps', 'sheets', 'decks']),
      itemId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id;
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        // Step 3a: tasks/notes/ideas live ONLY in their relational tables now —
        // delete the row directly and leave the frozen blob untouched. The
        // other kinds are still blob-backed and keep the blob filter.
        if (input.kind === 'tasks') {
          await db.delete(tasksTable).where(and(eq(tasksTable.userId, input.ownerUserId), eq(tasksTable.taskId, input.itemId)));
          return { ok: true as const };
        }
        if (input.kind === 'notes') {
          await db.delete(notesTable).where(and(eq(notesTable.userId, input.ownerUserId), eq(notesTable.noteId, input.itemId)));
          return { ok: true as const };
        }
        if (input.kind === 'ideas') {
          await db.delete(ideasTable).where(and(eq(ideasTable.userId, input.ownerUserId), eq(ideasTable.ideaId, input.itemId)));
          return { ok: true as const };
        }
        // Blob-backed kinds (projects/goals/programs/mindmaps/sheets/decks).
        const [appRow] = await db.select().from(userAppData).where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        const cur = appRow ? (appRow as any)[input.kind] : null;
        if (cur) {
          try {
            const arr = JSON.parse(cur);
            if (Array.isArray(arr)) {
              const next = arr.filter((x: any) => x && String(x.id) !== input.itemId);
              await db.update(userAppData).set({ [input.kind]: JSON.stringify(next) } as any).where(eq(userAppData.userId, input.ownerUserId));
            }
          } catch { /* blob unparseable */ }
        }
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Admin: TAKE OWNERSHIP of a shared TASK or PROJECT — move the item out of the
   * owner's blob into the admin's own workspace (admin becomes the owner of
   * record). The previous owner is kept on the item's `assignees` so they retain
   * access. For tasks, both users' relational mirrors are rebuilt. Non-destructive
   * to the item's data; only its storage owner changes.
   */
  transferItemOwnership: adminProcedure
    .input(z.object({
      ownerUserId: z.number().int(),
      kind: z.enum(['tasks', 'projects', 'programs', 'mindmaps', 'notes', 'sheets', 'decks']),
      itemId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      if (input.ownerUserId === ctx.user.id) return { ok: false as const, error: 'You already own this item.' };
      try {
        // Step 3a: tasks/notes are table-backed — read/write their arrays via
        // the relational store; blob-backed kinds keep using their columns.
        const RELATIONAL = input.kind === 'tasks' || input.kind === 'notes';
        const colOf = (k: string) => k === 'programs' ? userAppData.programs : k === 'mindmaps' ? userAppData.mindmaps : k === 'sheets' ? userAppData.sheets : k === 'decks' ? userAppData.decks : userAppData.projects;
        const setObj = (k: string, json: string): any => k === 'programs' ? { programs: json } : k === 'mindmaps' ? { mindmaps: json } : k === 'sheets' ? { sheets: json } : k === 'decks' ? { decks: json } : { projects: json };
        const readArr = async (uid: number): Promise<any[]> => {
          if (RELATIONAL) return readEntityArray(db, uid, input.kind as 'tasks' | 'notes');
          const [r] = await db.select({ v: colOf(input.kind) }).from(userAppData).where(eq(userAppData.userId, uid)).limit(1);
          try { const a = JSON.parse((r as any)?.v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
        };
        const writeArr = async (uid: number, arr: any[], deleteIds?: string[]) => {
          if (RELATIONAL) return writeEntityArray(db, uid, input.kind as 'tasks' | 'notes', arr, { deleteIds });
          const json = JSON.stringify(arr);
          await db.update(userAppData).set(setObj(input.kind, json)).where(eq(userAppData.userId, uid));
          return json;
        };
        const ownerArr = await readArr(input.ownerUserId);
        const idx = ownerArr.findIndex((x: any) => x && String(x.id) === input.itemId);
        if (idx < 0) return { ok: false as const, error: 'item not found' };
        const item = ownerArr[idx];
        ownerArr.splice(idx, 1);
        // Keep the previous owner as an assignee so they retain access.
        const prev: number[] = Array.isArray(item.assignees) ? item.assignees.map((x: any) => Number(x)).filter((n: number) => !isNaN(n)) : [];
        if (!prev.includes(input.ownerUserId)) prev.push(input.ownerUserId);
        item.assignees = prev;
        item._prevOwnerUserId = input.ownerUserId;
        const adminArr = await readArr(ctx.user.id);
        if (adminArr.some((x: any) => x && String(x.id) === input.itemId)) item.id = String(item.id) + '-' + ctx.user.id;
        adminArr.push(item);
        // Write the receiver first, then remove from the previous owner, so a
        // failure in between leaves a copy rather than losing the item.
        await writeArr(ctx.user.id, adminArr);
        await writeArr(input.ownerUserId, ownerArr, [input.itemId]);
        return { ok: true as const, newOwnerUserId: ctx.user.id };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * DESTRUCTIVE (admin-only): delete EVERYTHING in the admin's shared view —
   * every task owned by another member, plus the admin's own delegated tasks.
   * Two safety gates:
   *   1. With no confirmCount → DRY RUN: returns the count + per-owner breakdown,
   *      deletes nothing.
   *   2. With confirmCount → only deletes if it EXACTLY matches the current
   *      computed total (forces you to have seen the preview; refuses on drift).
   * Removes from each owner's JSON blob AND the relational tasks mirror.
   */
  adminDeleteSharedTasks: adminProcedure
    .input(z.object({ confirmCount: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        // Scope = everything in the admin shared view:
        //   tasks owned by someone else  +  my own tasks delegated out.
        const others = await db.select().from(tasksTable).where(ne(tasksTable.userId, ctx.user.id));
        const mineDelegated = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, ctx.user.id), ne(tasksTable.assigneeId, ctx.user.id)));
        const rows = others.concat(mineDelegated);
        const total = rows.length;

        const { adminListAllUsers } = await import("../db");
        const users = await adminListAllUsers();
        const nameById = new Map(users.map(u => [u.id, u.name || u.email || ('user ' + u.id)]));
        const byOwnerMap = new Map<number, number>();
        for (const r of rows) byOwnerMap.set(r.userId, (byOwnerMap.get(r.userId) || 0) + 1);
        const byOwner = Array.from(byOwnerMap.entries()).map(([userId, count]) => ({ userId, name: nameById.get(userId) || ('user ' + userId), count }));

        // Gate 1: dry run.
        if (input.confirmCount == null) {
          return { ok: true as const, preview: true as const, total, byOwner, sample: rows.slice(0, 12).map(r => ({ title: r.title, owner: nameById.get(r.userId) })) };
        }
        // Gate 2: count must match exactly.
        if (input.confirmCount !== total) {
          return { ok: false as const, error: `Count mismatch (you passed ${input.confirmCount}, current is ${total}). Re-run the preview and use the new number.`, total };
        }

        // Step 3a: the relational table is the sole task store — delete the
        // rows directly; frozen blobs stay untouched.
        for (const r of rows) { await db.delete(tasksTable).where(eq(tasksTable.id, r.id)); }
        return { ok: true as const, deleted: total, byOwner };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  /**
   * Admin cleanup: remove NATIVE task rows that are duplicates of live Nifty/LSI
   * synced tasks. These are the copies that surface in the "Shared" view; the
   * real synced versions live in `external_tasks` and are left untouched, so the
   * sync keeps working — we just drop the stray native twins (matched by title).
   * Two gates, same as adminDeleteSharedTasks:
   *   - no confirmCount → DRY RUN (count + sample + unmatched), deletes nothing.
   *   - confirmCount → must EXACTLY equal the matched count, else refuses.
   * Deletes relational rows by PRIMARY KEY (immune to Nifty's long ids being
   * truncated in taskId) and best-effort-prunes each owner's JSON blob.
   */
  adminRemoveNiftyDuplicates: adminProcedure
    .input(z.object({ confirmCount: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const norm = (s: any) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
        // Live (non-removed) Nifty synced task titles — the records we KEEP.
        const niftyRows = await db.select({ title: externalTasks.title })
          .from(externalTasks)
          .where(and(eq(externalTasks.source, 'nifty'), isNull(externalTasks.removedAt)));
        const niftyTitles = new Set(niftyRows.map((r: any) => norm(r.title)).filter(Boolean));
        if (!niftyTitles.size) return { ok: false as const, error: 'No live Nifty tasks found to match against — aborting so nothing is deleted by mistake.' };
        // The "shared pool" the admin sees: every native task owned by someone
        // else, plus the admin's own delegated tasks.
        const others = await db.select().from(tasksTable).where(ne(tasksTable.userId, ctx.user.id));
        const mineDelegated = await db.select().from(tasksTable).where(and(eq(tasksTable.userId, ctx.user.id), ne(tasksTable.assigneeId, ctx.user.id)));
        const pool = others.concat(mineDelegated);
        const dupes = pool.filter((r: any) => niftyTitles.has(norm(r.title)));
        const matched = dupes.length;
        const { adminListAllUsers } = await import("../db");
        const usersAll = await adminListAllUsers();
        const nameById = new Map(usersAll.map((u: any) => [u.id, u.name || u.email || ('user ' + u.id)]));
        const byOwnerMap = new Map<number, number>();
        for (const r of dupes) byOwnerMap.set(r.userId, (byOwnerMap.get(r.userId) || 0) + 1);
        const byOwner = Array.from(byOwnerMap.entries()).map(([userId, count]) => ({ userId, name: nameById.get(userId) || ('user ' + userId), count }));
        if (input.confirmCount == null) {
          const unmatched = pool.filter((r: any) => !niftyTitles.has(norm(r.title)));
          return {
            ok: true as const, preview: true as const,
            poolTotal: pool.length, willDelete: matched, byOwner,
            sample: dupes.slice(0, 12).map((r: any) => r.title),
            unmatched: unmatched.slice(0, 12).map((r: any) => r.title),
            unmatchedCount: unmatched.length,
          };
        }
        if (input.confirmCount !== matched) {
          return { ok: false as const, error: `Count mismatch (you passed ${input.confirmCount}, current match is ${matched}). Re-run the preview and use the new number.`, willDelete: matched };
        }
        // Step 3a: relational rows are the sole store — delete by primary key;
        // frozen blobs stay untouched.
        for (const r of dupes) { await db.delete(tasksTable).where(eq(tasksTable.id, r.id)); }
        return { ok: true as const, deleted: matched, byOwner };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  backfillTeamVisibilityIds: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { ok: false as const, error: 'db unavailable' };
    try {
      const { adminListAllUsers } = await import("../db");
      const usersList = await adminListAllUsers();
      const nameToId = new Map<string, number>();
      const emailToId = new Map<string, number>();
      // Same rule as _resolveUserIdMap: a display name shared by two accounts
      // resolves to nothing, or this backfill re-creates the exact leak it is
      // used to repair.
      const nameCount = new Map<string, number>();
      for (const u of usersList) {
        const n = u.name ? u.name.trim().toLowerCase() : "";
        if (n) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
      }
      for (const u of usersList) {
        const n = u.name ? u.name.trim().toLowerCase() : "";
        if (n && nameCount.get(n) === 1) nameToId.set(n, u.id);
        if (u.email) emailToId.set(u.email.trim().toLowerCase(), u.id);
      }
      const resolve = (s: string | null | undefined): number | null => {
        if (!s) return null;
        const key = String(s).trim().toLowerCase();
        return nameToId.get(key) ?? emailToId.get(key) ?? null;
      };

      const taskRows = await db.select().from(tasksTable);
      let tasksUpdated = 0;
      for (const r of taskRows) {
        const createdById = resolve(r.createdBy) ?? r.userId;
        const assigneeId = resolve(r.assignedTo);
        await db.update(tasksTable).set({ createdById, assigneeId }).where(eq(tasksTable.id, r.id));
        tasksUpdated++;
      }

      const noteRows = await db.select({ id: notesTable.id, userId: notesTable.userId }).from(notesTable);
      let notesUpdated = 0;
      for (const r of noteRows) {
        await db.update(notesTable).set({ createdById: r.userId, assigneeId: null }).where(eq(notesTable.id, r.id));
        notesUpdated++;
      }

      return { ok: true as const, users: usersList.length, tasksUpdated, notesUpdated };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message || e) };
    }
  }),

  /**
   * Team starter layout.
   *
   * The workspace OWNER can publish the layout new teammates begin with, so
   * they land on a workspace shaped for how this team actually works instead
   * of all ~31 pages at once. It is only a STARTING POINT — the setup wizard
   * seeds from it and the member can change anything afterwards. Nothing here
   * can hide a page from someone who has already chosen otherwise.
   *
   * Stored as one JSON row in system_settings (same key/value table the
   * notificationSender and aiKey_* settings already use), so no migration.
   */
  setTeamStarterPreset: protectedProcedure
    .input(z.object({ preset: z.string().max(40).nullable(), layout: z.any().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Gate on the OWNER, not isAdminUser — invited teammates are all admins.
      if (!(await isOwnerCtxUser(ctx.user as any))) {
        return { ok: false as const, error: 'Only the workspace owner can publish a team layout' };
      }
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'no database' };
      try {
        const value = JSON.stringify({
          preset: input.preset,
          layout: input.layout ?? null,
          publishedAt: new Date().toISOString(),
        });
        await db
          .insert(systemSettings)
          .values({ key: TEAM_PRESET_KEY, value })
          .onDuplicateKeyUpdate({ set: { value } });
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e) };
      }
    }),

  getTeamStarterPreset: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    try {
      const rows = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, TEAM_PRESET_KEY));
      if (!rows.length) return null;
      return JSON.parse(rows[0].value);
    } catch {
      // A malformed row must not break onboarding — fall back to no preset.
      return null;
    }
  }),
});
