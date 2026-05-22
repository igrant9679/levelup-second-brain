import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { userAppData, tasksTable } from "../../drizzle/schema";
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
});
