import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { userAppData, tasksTable, notesTable, ideasTable } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

// Keys that can be saved/loaded
const DATA_KEYS = ['tasks', 'notes', 'projects', 'goals', 'journal', 'habits', 'contacts', 'ideas', 'teams', 'prefs', 'calEvents', 'clusters'] as const;
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
async function mirrorTasksToRelational(db: any, userId: number, tasksJson: string) {
  let arr: any;
  try { arr = JSON.parse(tasksJson); } catch { return; }
  if (!Array.isArray(arr)) return;
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
});
