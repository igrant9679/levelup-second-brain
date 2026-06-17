import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { userAppData, tasksTable, notesTable, ideasTable } from "../../drizzle/schema";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";

// Keys that can be saved/loaded
const DATA_KEYS = ['tasks', 'notes', 'projects', 'goals', 'journal', 'habits', 'contacts', 'ideas', 'teams', 'prefs', 'calEvents', 'clusters', 'programs', 'opportunities', 'atlas', 'atlasAnnotations'] as const;
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
  try { arr = JSON.parse(tasksJson); } catch { return; }
  if (!Array.isArray(arr)) return;
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
  let blobTasks: any[] = [];
  try { const a = JSON.parse(blobRaw || '[]'); if (Array.isArray(a)) blobTasks = a; } catch {}
  let tableRows: any[];
  try {
    tableRows = await db.select().from(tasksTable).where(eq(tasksTable.userId, userId)).orderBy(tasksTable.id);
  } catch (err) {
    console.warn('[appData] relational tasks read failed — serving blob:', (err as Error)?.message);
    return { tasks: blobTasks, source: 'blob-error' };
  }
  if (!tableRows.length) return { tasks: blobTasks, source: 'blob-empty' };
  const tableTasks = tableRows
    .map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } })
    .filter((t: any) => t);
  const blobIds = new Set(blobTasks.filter((t: any) => t && t.id != null).map((t: any) => String(t.id)));
  const tableIds = new Set(tableTasks.map((t: any) => String(t.id)));
  const consistent = blobIds.size === tableIds.size && [...blobIds].every((id) => tableIds.has(id));
  if (!consistent) {
    console.warn('[appData] tasks blob/relational id mismatch — serving blob', { blob: blobIds.size, table: tableIds.size });
    return { tasks: blobTasks, source: 'blob-mismatch' };
  }
  return { tasks: tableTasks, source: 'relational' };
}

// Notes — mirror + read. Same pattern as tasks. `raw` is mediumtext to fit
// large bodyHtml from Word imports.
async function mirrorNotesToRelational(db: any, userId: number, json: string) {
  let arr: any;
  try { arr = JSON.parse(json); } catch { return; }
  if (!Array.isArray(arr)) return;
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
  let blobArr: any[] = [];
  try { const a = JSON.parse(blobRaw || '[]'); if (Array.isArray(a)) blobArr = a; } catch {}
  let tableRows: any[];
  try {
    tableRows = await db.select().from(notesTable).where(eq(notesTable.userId, userId)).orderBy(notesTable.id);
  } catch (err) {
    console.warn('[appData] relational notes read failed — serving blob:', (err as Error)?.message);
    return { notes: blobArr, source: 'blob-error' };
  }
  if (!tableRows.length) return { notes: blobArr, source: 'blob-empty' };
  const tableItems = tableRows
    .map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } })
    .filter((t: any) => t);
  const blobIds = new Set(blobArr.filter((t: any) => t && t.id != null).map((t: any) => String(t.id)));
  const tableIds = new Set(tableItems.map((t: any) => String(t.id)));
  const consistent = blobIds.size === tableIds.size && [...blobIds].every((id) => tableIds.has(id));
  if (!consistent) {
    console.warn('[appData] notes blob/relational id mismatch — serving blob', { blob: blobIds.size, table: tableIds.size });
    return { notes: blobArr, source: 'blob-mismatch' };
  }
  return { notes: tableItems, source: 'relational' };
}

// Ideas — mirror + read. Same pattern. Surfaces the ICE scoring (impact /
// confidence / ease) and stage as queryable columns.
async function mirrorIdeasToRelational(db: any, userId: number, json: string) {
  let arr: any;
  try { arr = JSON.parse(json); } catch { return; }
  if (!Array.isArray(arr)) return;
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
  let blobArr: any[] = [];
  try { const a = JSON.parse(blobRaw || '[]'); if (Array.isArray(a)) blobArr = a; } catch {}
  let tableRows: any[];
  try {
    tableRows = await db.select().from(ideasTable).where(eq(ideasTable.userId, userId)).orderBy(ideasTable.id);
  } catch (err) {
    console.warn('[appData] relational ideas read failed — serving blob:', (err as Error)?.message);
    return { ideas: blobArr, source: 'blob-error' };
  }
  if (!tableRows.length) return { ideas: blobArr, source: 'blob-empty' };
  const tableItems = tableRows
    .map((r: any) => { try { return JSON.parse(r.raw); } catch { return null; } })
    .filter((t: any) => t);
  const blobIds = new Set(blobArr.filter((t: any) => t && t.id != null).map((t: any) => String(t.id)));
  const tableIds = new Set(tableItems.map((t: any) => String(t.id)));
  const consistent = blobIds.size === tableIds.size && [...blobIds].every((id) => tableIds.has(id));
  if (!consistent) {
    console.warn('[appData] ideas blob/relational id mismatch — serving blob', { blob: blobIds.size, table: tableIds.size });
    return { ideas: blobArr, source: 'blob-mismatch' };
  }
  return { ideas: tableItems, source: 'relational' };
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };

      // Build only the columns that were provided
      const updates: Partial<Record<DataKey, string>> = {};
      for (const key of DATA_KEYS) {
        const val = input[key as keyof typeof input];
        if (val !== undefined) {
          updates[key as DataKey] = val;
        }
      }

      if (Object.keys(updates).length === 0) return { ok: true };

      // Upsert: insert or update on duplicate userId
      await db
        .insert(userAppData)
        .values({ userId: ctx.user.id, ...updates })
        .onDuplicateKeyUpdate({ set: updates });

      // Dual-write pilot: mirror tasks into the relational `tasks` table so
      // they're queryable at the DB level. The JSON blob above stays the
      // source of truth — a failure here must never affect the blob save.
      if (updates.tasks !== undefined) {
        try {
          await mirrorTasksToRelational(db, ctx.user.id, updates.tasks);
        } catch (err) {
          console.warn('[appData] tasks relational mirror failed:', (err as Error)?.message);
        }
      }
      if (updates.notes !== undefined) {
        try {
          await mirrorNotesToRelational(db, ctx.user.id, updates.notes);
        } catch (err) {
          console.warn('[appData] notes relational mirror failed:', (err as Error)?.message);
        }
      }
      if (updates.ideas !== undefined) {
        try {
          await mirrorIdeasToRelational(db, ctx.user.id, updates.ideas);
        } catch (err) {
          console.warn('[appData] ideas relational mirror failed:', (err as Error)?.message);
        }
      }

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
   *   - regular member → tasks ASSIGNED to them by someone else (assigneeId==me,
   *     owned by another user);
   *   - admin / owner   → every other member's tasks (full visibility).
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
      // Tasks owned by OTHERS: assigned to me, or all of them if I'm admin.
      const sharedRows = admin
        ? await db.select().from(tasksTable).where(ne(tasksTable.userId, ctx.user.id))
        : await db.select().from(tasksTable).where(and(eq(tasksTable.assigneeId, ctx.user.id), ne(tasksTable.userId, ctx.user.id)));
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
      const rows = await db.select({ userId: userAppData.userId, projects: userAppData.projects }).from(userAppData);
      const out: any[] = [];
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
            if (assignee && !myKeys.has(assignee)) {
              out.push({ ...p, _sharedFromUserId: r.userId, _readOnly: true, _delegated: true, _assigneeName: assigneeName });
            }
          }
        } else {
          // OTHER members' projects: assigned to me, or all of them if I'm admin.
          for (const p of arr) {
            if (!p) continue;
            const assignee = String(p.assignee || p.assignedTo || '').trim().toLowerCase();
            if (admin || (assignee && myKeys.has(assignee))) {
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

        // 1) Owner's JSON blob (source of truth).
        const [appRow] = await db.select({ tasks: userAppData.tasks }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (appRow && appRow.tasks) {
          try {
            const arr = JSON.parse(appRow.tasks);
            if (Array.isArray(arr)) {
              const t = arr.find((x: any) => x && String(x.id) === input.taskId);
              if (t) {
                t.status = input.status;
                t.completedAt = completedAt;
                await db.update(userAppData).set({ tasks: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId));
              }
            }
          } catch { /* blob unparseable — mirror update below still applies */ }
        }

        // 2) Relational mirror (status col + raw JSON).
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
        const allowed = isAdminUser(ctx.user as any) || row.assigneeId === ctx.user.id || row.userId === ctx.user.id;
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
        const applyTo = (t: any) => {
          if (p.title != null) t.title = p.title;
          if (p.status != null) { t.status = p.status; t.completedAt = completedAt; }
          if (p.priority != null) t.priority = p.priority;
          if (p.due != null) t.due = p.due;
          if (p.notes != null) t.notes = p.notes;
          if (p.assignedTo != null) t.assignedTo = p.assignedTo;
        };

        // 1) Owner's blob (source of truth).
        const [appRow] = await db.select({ tasks: userAppData.tasks }).from(userAppData)
          .where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        if (appRow && appRow.tasks) {
          try {
            const arr = JSON.parse(appRow.tasks);
            if (Array.isArray(arr)) {
              const t = arr.find((x: any) => x && String(x.id) === input.taskId);
              if (t) { applyTo(t); await db.update(userAppData).set({ tasks: JSON.stringify(arr) }).where(eq(userAppData.userId, input.ownerUserId)); }
            }
          } catch { /* blob unparseable — mirror update still applies */ }
        }

        // 2) Relational mirror (queryable cols + raw).
        let newRaw = row.raw;
        try { const t = JSON.parse(row.raw || '{}'); applyTo(t); newRaw = JSON.stringify(t); } catch { /* keep old raw */ }
        const set: Record<string, unknown> = { raw: newRaw };
        if (p.title != null) set.title = p.title.slice(0, 512);
        if (p.status != null) { set.status = p.status.slice(0, 32); set.completedAt = completedAt ? completedAt.slice(0, 40) : null; }
        if (p.priority != null) set.priority = p.priority.slice(0, 16);
        if (p.due != null) set.due = p.due.slice(0, 32);
        if (p.assignedTo != null) { set.assignedTo = p.assignedTo.slice(0, 255); set.assigneeId = newAssigneeId ?? null; }
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
        // Authorize: admin, owner, or current assignee (by name/email).
        let allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id;
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
        if (q.assignedTo != null) proj.assignedTo = q.assignedTo;
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
      kind: z.enum(['tasks', 'projects', 'goals', 'ideas', 'notes']),
      itemId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: 'db unavailable' };
      try {
        const { isAdminUser } = await import("../_core/access");
        const allowed = isAdminUser(ctx.user as any) || input.ownerUserId === ctx.user.id;
        if (!allowed) return { ok: false as const, error: 'not authorized' };
        // Remove from the owner's JSON blob.
        const [appRow] = await db.select().from(userAppData).where(eq(userAppData.userId, input.ownerUserId)).limit(1);
        const cur = appRow ? (appRow as any)[input.kind] : null;
        if (cur) {
          try {
            const arr = JSON.parse(cur);
            if (Array.isArray(arr)) {
              const next = arr.filter((x: any) => x && String(x.id) !== input.itemId);
              await db.update(userAppData).set({ [input.kind]: JSON.stringify(next) } as any).where(eq(userAppData.userId, input.ownerUserId));
            }
          } catch { /* blob unparseable — mirror delete below still applies */ }
        }
        // Relational mirror.
        if (input.kind === 'tasks') {
          await db.delete(tasksTable).where(and(eq(tasksTable.userId, input.ownerUserId), eq(tasksTable.taskId, input.itemId)));
        } else if (input.kind === 'notes') {
          await db.delete(notesTable).where(and(eq(notesTable.userId, input.ownerUserId), eq(notesTable.noteId, input.itemId)));
        }
        return { ok: true as const };
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

        // Delete: edit each owner's blob, then drop the mirror rows.
        const idsByOwner = new Map<number, Set<string>>();
        for (const r of rows) {
          if (!idsByOwner.has(r.userId)) idsByOwner.set(r.userId, new Set());
          idsByOwner.get(r.userId)!.add(String(r.taskId));
        }
        for (const [uid, ids] of idsByOwner.entries()) {
          const [appRow] = await db.select({ tasks: userAppData.tasks }).from(userAppData).where(eq(userAppData.userId, uid)).limit(1);
          if (appRow && appRow.tasks) {
            try {
              const parsed = JSON.parse(appRow.tasks);
              if (Array.isArray(parsed)) {
                const next = parsed.filter((x: any) => !(x && ids.has(String(x.id))));
                await db.update(userAppData).set({ tasks: JSON.stringify(next) }).where(eq(userAppData.userId, uid));
              }
            } catch { /* blob unparseable — mirror delete below still applies */ }
          }
        }
        for (const r of rows) { await db.delete(tasksTable).where(eq(tasksTable.id, r.id)); }
        return { ok: true as const, deleted: total, byOwner };
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
});
