/**
 * Time entries router.
 *
 * Backs the per-task timer + the "Est X / Actual Y" line in the drawer.
 * Local tasks (source='local') reference tasksTable.taskId; external tasks
 * (source='smartsheet'|'nifty') reference externalTasks.externalId. The
 * client passes whichever it has.
 *
 * Endpoints:
 *   timeEntries.start    — begin a timer (errors if one is already running for this task)
 *   timeEntries.stop     — close the currently running timer for this task
 *   timeEntries.cancel   — cancel the currently running timer (no entry recorded)
 *   timeEntries.add      — add a completed entry retroactively (manual log)
 *   timeEntries.listForTask    — entries for one task
 *   timeEntries.totalsByTask   — sum of minutes per task (for drawer "Actual" line)
 *   timeEntries.running        — currently running entry, if any (one per user max)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { timeEntries } from "../../drizzle/schema";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

const sourceEnum = z.enum(['local', 'smartsheet', 'nifty']);

export const timeEntriesRouter = router({
  /**
   * Currently running entry for the user, if any. Used by the client to
   * show the "Timer running on …" affordance and to prevent double-start.
   */
  running: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.endedAt)))
      .limit(1);
    return rows[0] ?? null;
  }),

  start: protectedProcedure
    .input(z.object({
      taskId: z.string().max(40),
      source: sourceEnum.default('local'),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // If a timer is already running anywhere for this user, stop it first.
      // Single-active-timer is the simplest UX and matches the existing
      // single-timerBtn UI in app-part1.js.
      await db.update(timeEntries)
        .set({
          endedAt: sql`CURRENT_TIMESTAMP`,
          durationMins: sql`TIMESTAMPDIFF(MINUTE, startedAt, CURRENT_TIMESTAMP)`,
        })
        .where(and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.endedAt)));

      const res = await db.insert(timeEntries).values({
        userId: ctx.user.id,
        taskId: input.taskId,
        source: input.source,
        startedAt: sql`CURRENT_TIMESTAMP`,
      });
      return { success: true, insertId: res[0]?.insertId };
    }),

  stop: protectedProcedure
    .input(z.object({
      taskId: z.string().max(40).optional(),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const where = input.taskId
        ? and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.endedAt), eq(timeEntries.taskId, input.taskId))
        : and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.endedAt));
      const set: Record<string, unknown> = {
        endedAt: sql`CURRENT_TIMESTAMP`,
        durationMins: sql`TIMESTAMPDIFF(MINUTE, startedAt, CURRENT_TIMESTAMP)`,
      };
      if (input.note) set.note = input.note;
      await db.update(timeEntries).set(set).where(where);
      return { success: true };
    }),

  cancel: protectedProcedure
    .input(z.object({ taskId: z.string().max(40).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const where = input.taskId
        ? and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.endedAt), eq(timeEntries.taskId, input.taskId))
        : and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.endedAt));
      await db.delete(timeEntries).where(where);
      return { success: true };
    }),

  /**
   * Manual log — recorded session in the past (e.g. "I worked 45m offline").
   * startedAt + durationMins required; endedAt is computed.
   */
  add: protectedProcedure
    .input(z.object({
      taskId: z.string().max(40),
      source: sourceEnum.default('local'),
      startedAt: z.string(), // ISO
      durationMins: z.number().int().min(1).max(24 * 60),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const start = new Date(input.startedAt);
      const end = new Date(start.getTime() + input.durationMins * 60_000);
      await db.insert(timeEntries).values({
        userId: ctx.user.id,
        taskId: input.taskId,
        source: input.source,
        startedAt: start,
        endedAt: end,
        durationMins: input.durationMins,
        note: input.note ?? null,
      });
      return { success: true };
    }),

  listForTask: protectedProcedure
    .input(z.object({ taskId: z.string().max(40) }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      return db.select().from(timeEntries)
        .where(and(eq(timeEntries.userId, ctx.user.id), eq(timeEntries.taskId, input.taskId)))
        .orderBy(timeEntries.startedAt);
    }),

  /**
   * Per-task minute totals. Single row per (taskId, source). Used by the
   * drawer to render "Estimated 90m / Actual 67m" without N+1 queries.
   */
  totalsByTask: protectedProcedure
    .input(z.object({ sinceDays: z.number().int().min(1).max(365).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions = [eq(timeEntries.userId, ctx.user.id)];
      if (input?.sinceDays) {
        const since = new Date(Date.now() - input.sinceDays * 86_400_000);
        conditions.push(gte(timeEntries.startedAt, since));
      }
      const rows = await db.select({
        taskId: timeEntries.taskId,
        source: timeEntries.source,
        mins: sql<number>`COALESCE(SUM(${timeEntries.durationMins}), 0)`.as('mins'),
        entries: sql<number>`COUNT(*)`.as('entries'),
      })
        .from(timeEntries)
        .where(and(...conditions))
        .groupBy(timeEntries.taskId, timeEntries.source);
      return rows;
    }),
});
