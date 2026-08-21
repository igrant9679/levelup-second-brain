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

async function isOwnerCtxUser(user: { id: number; openId?: string | null }): Promise<boolean> {
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
const DATA_KEYS =['tasks', 'notes', 'projects', 'goals', 'journal', 'habits', 'contacts', 'ideas', 'teams', 'prefs', 'calEvents', 'clusters', 'programs', 'opportunities', 'atlas', 'atlasAnnotations', 'mindmaps', 'sheets', 'decks'] as const;
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
async function _resolveUserIdMap(): Promise<Map<string, number>> {
  const now = Date.now();
  if (_uidMapCache && now - _uidMapCache.at < 60000) return _uidMapCache.map;
  const map = new Map<string, number>();
  try {
    const { adminListAllUsers } = await import("../db");
    const users = await adminListAllUsers();
    for (const u of users) {
      if (u.name) map.set(String(u.name).trim().toLowerCase(), u.id);
      if (u.email) map.set(String(u.email).trim().toLowerCase(), u.id);
    }
  } catch { /* leave empty — ids stay null, no harm */ }
  _uidMapCache = { map, at: now };
  return map;
}

async function mirrorTasksToRelational(db: any, userId: number, tasksJson: string) {
  let arr: any;
  // Step 3a: this write is authoritative — reject bad payloads loudly instead
  // of silently storing nothing while the save reports ok.
  try { arr = JSON.parse(tasksJson); } catch { throw new Error('tasks payload is not valid JSON'); }
  if (!Array.isArray(arr)) throw new Error('tasks payload is not an array');
  const idMap = await _resolveUserIdMap();
  const resolveId = (s: any): number | null => {
    if (!s) return null;
    return idMap.get(String(s).trim().toLowerCase()) ?? null;
  };
  const seen = new Set<string>();
  const rows = arr
    .filter((t: any) => t && t.id != null && String(t.id).length > 0)
    .map((t: any) => ({
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
    }))
    .filter((r: any) => !seen.has(r.taskId) && seen.add(r.taskId));
  await db.delete(tasksTable).where(eq(tasksTable.userId, userId));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(tasksTable).values(rows.slice(i, i + 200));
  }
  return rows.length;
}

/**
 * Read a user's tasks. Reads come from the relational `tasks` table; the JSON
 * blob is a consistency-checked fallback, used only if the table is empty /
 * unreadable, or its id-set diverges from the blob (a missed dual-write).
 * Rows are ordered by PK, which mirrors the blob array order (the mirror
 * delete+re-inserts in array order on every save), so manual task order is
 * preserved. Returns the array plus which source served it.
 */
async function readTasks(db: any, userId: number, blobRaw: string | null): Promise<{ tasks: any[]; source: string }> {
  // Step 3a: the relational table IS the store — served unconditionally. The
  // FROZEN blob is consulted only for (a) a transient table read error and
  // (b) a loud rescue if this user's table was somehow never populated while
  // the frozen blob still holds items (a never-mirrored account). The old
  // consistency check is gone: the blob no longer receives writes, so a
  // divergence is expected, not an anomaly.
  let blobTasks: any[] = [];
  try { const a = JSON.parse(blobRaw || '[]'); if (Array.isArray(a)) blobTasks = a; } catch {}
  let tableRows: any[];
  try {
    tableRows = await db.select().from(tasksTable).where(eq(tasksTable.userId, userId)).orderBy(tasksTable.id);
  } catch (err) {
    console.warn('[appData] relational tasks read failed — serving frozen blob:', (err as Error)?.message);
    return { tasks: blobTasks, source: 'blob-error' };
  }
  if (!tableRows.length && blobTasks.length) {
    console.warn('[appData] tasks table EMPTY but frozen blob has', blobTasks.length, 'items for user', userId, '— serving blob (rescue). Run backfillTasksRelational for this account.');
    return { tasks: blobTasks, source: 'blob-rescue' };
  }
  const tableTasks = tableRows
    .map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } })
    .filter((t: any) => t);
  return { tasks: tableTasks, source: 'relational' };
}

// Notes — mirror + read. Same pattern as tasks. `raw` is mediumtext to fit
// large bodyHtml from Word imports.
async function mirrorNotesToRelational(db: any, userId: number, json: string) {
  let arr: any;
  try { arr = JSON.parse(json); } catch { throw new Error('notes payload is not valid JSON'); }
  if (!Array.isArray(arr)) throw new Error('notes payload is not an array');
  const seen = new Set<string>();
  const rows = arr
    .filter((n: any) => n && n.id != null && String(n.id).length > 0)
    .map((n: any) => ({
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
    }))
    .filter((r: any) => !seen.has(r.noteId) && seen.add(r.noteId));
  await db.delete(notesTable).where(eq(notesTable.userId, userId));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(notesTable).values(rows.slice(i, i + 200));
  }
  return rows.length;
}

async function readNotes(db: any, userId: number, blobRaw: string | null): Promise<{ notes: any[]; source: string }> {
  // Step 3a: table-authoritative — see readTasks for the rescue semantics.
  let blobArr: any[] = [];
  try { const a = JSON.parse(blobRaw || '[]'); if (Array.isArray(a)) blobArr = a; } catch {}
  let tableRows: any[];
  try {
    tableRows = await db.select().from(notesTable).where(eq(notesTable.userId, userId)).orderBy(notesTable.id);
  } catch (err) {
    console.warn('[appData] relational notes read failed — serving frozen blob:', (err as Error)?.message);
    return { notes: blobArr, source: 'blob-error' };
  }
  if (!tableRows.length && blobArr.length) {
    console.warn('[appData] notes table EMPTY but frozen blob has', blobArr.length, 'items for user', userId, '— serving blob (rescue). Run backfillNotesRelational for this account.');
    return { notes: blobArr, source: 'blob-rescue' };
  }
  const tableItems = tableRows
    .map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } })
    .filter((t: any) => t);
  return { notes: tableItems, source: 'relational' };
}

// Ideas — mirror + read. Same pattern. Surfaces the ICE scoring (impact /
// confidence / ease) and stage as queryable columns.
async function mirrorIdeasToRelational(db: any, userId: number, json: string) {
  let arr: any;
  try { arr = JSON.parse(json); } catch { throw new Error('ideas payload is not valid JSON'); }
  if (!Array.isArray(arr)) throw new Error('ideas payload is not an array');
  const seen = new Set<string>();
  const rows = arr
    .filter((i: any) => i && i.id != null && String(i.id).length > 0)
    .map((i: any) => ({
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
    }))
    .filter((r: any) => !seen.has(r.ideaId) && seen.add(r.ideaId));
  await db.delete(ideasTable).where(eq(ideasTable.userId, userId));
  for (let j = 0; j < rows.length; j += 200) {
    await db.insert(ideasTable).values(rows.slice(j, j + 200));
  }
  return rows.length;
}

async function readIdeas(db: any, userId: number, blobRaw: string | null): Promise<{ ideas: any[]; source: string }> {
  // Step 3a: table-authoritative — see readTasks for the rescue semantics.
  let blobArr: any[] = [];
  try { const a = JSON.parse(blobRaw || '[]'); if (Array.isArray(a)) blobArr = a; } catch {}
  let tableRows: any[];
  try {
    tableRows = await db.select().from(ideasTable).where(eq(ideasTable.userId, userId)).orderBy(ideasTable.id);
  } catch (err) {
    console.warn('[appData] relational ideas read failed — serving frozen blob:', (err as Error)?.message);
    return { ideas: blobArr, source: 'blob-error' };
  }
  if (!tableRows.length && blobArr.length) {
    console.warn('[appData] ideas table EMPTY but frozen blob has', blobArr.length, 'items for user', userId, '— serving blob (rescue). Run backfillIdeasRelational for this account.');
    return { ideas: blobArr, source: 'blob-rescue' };
  }
  const tableItems = tableRows
    .map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } })
    .filter((t: any) => t);
  return { ideas: tableItems, source: 'relational' };
}

// Step 3a table-based array access for the migrated entities — used by every
// mutation that previously parsed/patched/rewrote the (now frozen) blob
// columns. ORDER BY id preserves manual ordering (the mirrors delete +
// re-insert in array order on every write).
// Exported: imageMigration.ts uses these to operate on the LIVE relational
// store (post-Step-3a the user_app_data blobs are frozen snapshots).
export async function readEntityArray(db: any, userId: number, kind: 'tasks' | 'notes' | 'ideas'): Promise<any[]> {
  const t = kind === 'tasks' ? tasksTable : kind === 'notes' ? notesTable : ideasTable;
  const rows = await db.select().from(t).where(eq(t.userId, userId)).orderBy(t.id);
  return rows.map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } }).filter(Boolean);
}
export async function writeEntityArray(db: any, userId: number, kind: 'tasks' | 'notes' | 'ideas', arr: any[]): Promise<string> {
  const json = JSON.stringify(arr);
  if (kind === 'tasks') await mirrorTasksToRelational(db, userId, json);
  else if (kind === 'notes') await mirrorNotesToRelational(db, userId, json);
  else await mirrorIdeasToRelational(db, userId, json);
  return json;
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
      if (key === 'tasks') {
        // Tasks now read from the relational `tasks` table (blob is the
        // consistency-checked fallback). _tasksSource lets the flip be monitored.
        const tr = await readTasks(db, ctx.user.id, raw);
        result.tasks = tr.tasks;
        result._tasksSource = tr.source;
        continue;
      }
      if (key === 'notes') {
        const nr = await readNotes(db, ctx.user.id, raw);
        result.notes = nr.notes;
        result._notesSource = nr.source;
        continue;
      }
      if (key === 'ideas') {
        const ir = await readIdeas(db, ctx.user.id, raw);
        result.ideas = ir.ideas;
        result._ideasSource = ir.source;
        continue;
      }
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
      const RELATIONAL_ONLY = new Set<DataKey>(['tasks', 'notes', 'ideas']);
      const updates: Partial<Record<DataKey, string>> = {};
      for (const key of DATA_KEYS) {
        const val = input[key as keyof typeof input];
        if (val !== undefined && !RELATIONAL_ONLY.has(key)) {
          updates[key as DataKey] = val;
        }
      }
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
      if (input.tasks !== undefined) await mirrorTasksToRelational(db, ctx.user.id, input.tasks);
      if (input.notes !== undefined) await mirrorNotesToRelational(db, ctx.user.id, input.notes);
      if (input.ideas !== undefined) await mirrorIdeasToRelational(db, ctx.user.id, input.ideas);

      return { ok: true };
    }),

  /**
   * One-shot: populate the relational `tasks` table from the user's existing
   * JSON blob. The blob isn't re-saved until a task is edited, so the
   * dual-write alone won't backfill data that already exists.
   */
  backfillTasksRelational: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false, count: 0 };
    const rows = await db
      .select()
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    if (!rows.length || rows[0].tasks == null) return { ok: true, count: 0 };
    const count = await mirrorTasksToRelational(db, ctx.user.id, rows[0].tasks);
    return { ok: true, count: count ?? 0 };
  }),

  /**
   * Verify the relational tasks mirror independently of the read path:
   * row count in the `tasks` table vs the JSON blob, and whether they agree.
   */
  tasksRelationalStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const };
    const tableRows = await db
      .select({ taskId: tasksTable.taskId })
      .from(tasksTable)
      .where(eq(tasksTable.userId, ctx.user.id));
    const blobRow = await db
      .select({ tasks: userAppData.tasks })
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    let blobCount = 0;
    try {
      const a = JSON.parse(blobRow[0]?.tasks || '[]');
      if (Array.isArray(a)) blobCount = a.filter((t: any) => t && t.id != null).length;
    } catch {}
    return {
      ok: true as const,
      tableCount: tableRows.length,
      blobCount,
      consistent: tableRows.length === blobCount,
    };
  }),

  // ── notes ─────────────────────────────────────────────────────────────
  backfillNotesRelational: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false, count: 0 };
    const rows = await db
      .select()
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    if (!rows.length || rows[0].notes == null) return { ok: true, count: 0 };
    const count = await mirrorNotesToRelational(db, ctx.user.id, rows[0].notes);
    return { ok: true, count: count ?? 0 };
  }),

  notesRelationalStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const };
    const tableRows = await db
      .select({ noteId: notesTable.noteId })
      .from(notesTable)
      .where(eq(notesTable.userId, ctx.user.id));
    const blobRow = await db
      .select({ notes: userAppData.notes })
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    let blobCount = 0;
    try {
      const a = JSON.parse(blobRow[0]?.notes || '[]');
      if (Array.isArray(a)) blobCount = a.filter((t: any) => t && t.id != null).length;
    } catch {}
    return {
      ok: true as const,
      tableCount: tableRows.length,
      blobCount,
      consistent: tableRows.length === blobCount,
    };
  }),

  // ── ideas ─────────────────────────────────────────────────────────────
  backfillIdeasRelational: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false, count: 0 };
    const rows = await db
      .select()
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    if (!rows.length || rows[0].ideas == null) return { ok: true, count: 0 };
    const count = await mirrorIdeasToRelational(db, ctx.user.id, rows[0].ideas);
    return { ok: true, count: count ?? 0 };
  }),

  ideasRelationalStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const };
    const tableRows = await db
      .select({ ideaId: ideasTable.ideaId })
      .from(ideasTable)
      .where(eq(ideasTable.userId, ctx.user.id));
    const blobRow = await db
      .select({ ideas: userAppData.ideas })
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    let blobCount = 0;
    try {
      const a = JSON.parse(blobRow[0]?.ideas || '[]');
      if (Array.isArray(a)) blobCount = a.filter((t: any) => t && t.id != null).length;
    } catch {}
    return {
      ok: true as const,
      tableCount: tableRows.length,
      blobCount,
      consistent: tableRows.length === blobCount,
    };
  }),

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
    const rows = await db.select().from(userAppData);
    return {
      ok: true as const,
      exportedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows,
    };
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
      // A task is "assigned to me" if I'm the relational primary (assigneeId)
      // OR I'm in the multi-assignee array / primaryAssigneeId stored in raw.
      const isMineAssigned = (r: any): boolean => {
        if (r.assigneeId === ctx.user.id) return true;
        try {
          const t = JSON.parse(r.raw || '{}');
          if (Array.isArray(t.assignees) && t.assignees.map((x: any) => Number(x)).includes(ctx.user.id)) return true;
          if (t.primaryAssigneeId != null && Number(t.primaryAssigneeId) === ctx.user.id) return true;
        } catch {}
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
      const myKeys = new Set([me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase()));
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
      const myKeys = new Set([me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase()));
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
          const me = (await adminListAllUsers()).find(u => u.id === ctx.user.id);
          const myKeys = [me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase());
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
      const myKeys = new Set([me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase()));
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
          const me = (await adminListAllUsers()).find(u => u.id === ctx.user.id);
          const myKeys = [me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase());
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
      const myKeys = new Set([me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase()));
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
          const me = (await adminListAllUsers()).find(u => u.id === ctx.user.id);
          const myKeys = [me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase());
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
      const myKeys = new Set([me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase()));
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
          const me = (await adminListAllUsers()).find(u => u.id === ctx.user.id);
          const myKeys = [me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase());
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
      const myKeys = new Set([me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase()));
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
          const me = (await adminListAllUsers()).find(u => u.id === ctx.user.id);
          const myKeys = [me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase());
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
      const isMineAssigned = (r: any): boolean => {
        if (r.assigneeId === ctx.user.id) return true;
        try {
          const t = JSON.parse(r.raw || '{}');
          if (t.shareAll === true) return true;
          if (Array.isArray(t.assignees) && t.assignees.map((x: any) => Number(x)).includes(ctx.user.id)) return true;
          if (t.primaryAssigneeId != null && Number(t.primaryAssigneeId) === ctx.user.id) return true;
        } catch {}
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
        const allowed = isAdminUser(ctx.user as any) || row.assigneeId === ctx.user.id || row.userId === ctx.user.id;
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
        const allowed = isAdminUser(ctx.user as any) || row.assigneeId === ctx.user.id || row.userId === ctx.user.id || rawAssignees.includes(ctx.user.id);
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
          const me = (await adminListAllUsers()).find(u => u.id === ctx.user.id);
          const myKeys = [me?.name, me?.email].filter(Boolean).map(s => String(s).trim().toLowerCase());
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
        const writeArr = async (uid: number, arr: any[]) => {
          if (RELATIONAL) return writeEntityArray(db, uid, input.kind as 'tasks' | 'notes', arr);
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
        await writeArr(input.ownerUserId, ownerArr);
        await writeArr(ctx.user.id, adminArr);
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
      for (const u of usersList) {
        if (u.name) nameToId.set(u.name.trim().toLowerCase(), u.id);
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
