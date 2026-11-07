/**
 * One-shot task-migration endpoints.
 *
 * Currently:
 *   taskMigrations.backfillNestedSubtasks  — lift JSON subtasks out of
 *     tasks.raw into real rows with parentTaskId pointing at the parent.
 *     Idempotent: re-running won't duplicate (matches on synthetic
 *     `_subtaskOriginalIndex` written into raw on first run).
 *   taskMigrations.runRecurrenceNow        — kick the recurrence engine for
 *     the current user (handy for testing without waiting for the daily tick).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { tasksTable } from "../../drizzle/schema";
import { processRecurrence } from "../_core/recurrenceEngine";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

/**
 * Fields a promoted subtask inherits from its parent (audit F96). They were
 * written only to the table columns, but the client reads tasks from `raw`,
 * so promoted subtasks showed with no priority, due date, project, cluster or
 * assignee. Copied into raw exactly as the parent's raw holds them.
 */
export const INHERITED_SUBTASK_FIELDS = [
  'priority', 'due', 'startDate', 'project', 'projectId', 'clusterId',
  'assignee', 'assignees', 'assigneeNames', 'primaryAssigneeId', 'assignedTo', 'assigneeId',
] as const;

/** The raw JSON of a subtask promoted from parent raw `praw`. */
export function promotedSubtaskRaw(praw: Record<string, any>, st: JsonSubtask, childTaskId: string, parentTaskId: string, index: number): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of INHERITED_SUBTASK_FIELDS) {
    if (praw[k] !== undefined && praw[k] !== null && praw[k] !== '') out[k] = Array.isArray(praw[k]) ? praw[k].slice() : praw[k];
  }
  return {
    ...out,
    id: childTaskId,
    title: st.title,
    status: st.done ? 'Done' : 'Not Started',
    done: !!st.done,
    ...(st.done ? { completedAt: new Date().toISOString() } : {}),
    descHtml: st.descHtml ?? null,
    parentTaskId,
    _promotedFromSubtaskIndex: index,
  };
}

interface JsonSubtask {
  id?: number | string;
  title?: string;
  done?: boolean;
  descHtml?: string;
}

export const taskMigrationsRouter = router({
  /**
   * Walks the user's tasks, finds any whose `raw.subtasks` array has rows
   * not yet promoted, and inserts a child task per subtask with
   * parentTaskId = parent.taskId. Sets `_subtasksPromotedAt` on the parent's
   * raw so a second pass is a no-op.
   *
   * The original `raw.subtasks` array stays in place during a soak period —
   * client renderers fall back to it if no real children exist. A later
   * cleanup pass will strip the JSON copy once the UI is fully relational.
   */
  backfillNestedSubtasks: protectedProcedure
    .input(z.object({ dryRun: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const all = await db.select().from(tasksTable)
        .where(and(eq(tasksTable.userId, ctx.user.id), isNull(tasksTable.parentTaskId)));

      let parentsScanned = 0;
      let subtasksPromoted = 0;
      let parentsAlreadyDone = 0;

      for (const parent of all) {
        if (!parent.raw) continue;
        let raw: { subtasks?: JsonSubtask[]; _subtasksPromotedAt?: string };
        try { raw = JSON.parse(parent.raw); } catch { continue; }
        if (!Array.isArray(raw.subtasks) || raw.subtasks.length === 0) continue;
        if (raw._subtasksPromotedAt) { parentsAlreadyDone++; continue; }
        parentsScanned++;

        if (input.dryRun) {
          subtasksPromoted += raw.subtasks.length;
          continue;
        }

        let i = 0;
        for (const st of raw.subtasks) {
          const childTaskId = `s${Date.now()}${parent.id}${i}`;
          await db.insert(tasksTable).values({
            userId: ctx.user.id,
            taskId: childTaskId,
            title: (st.title ?? '(untitled subtask)').slice(0, 512),
            status: st.done ? 'Done' : 'Not Started',
            priority: parent.priority,
            due: parent.due,
            startDate: parent.startDate,
            completedAt: st.done ? new Date().toISOString() : null,
            projectId: parent.projectId,
            clusterId: parent.clusterId,
            myDay: 0,
            context: parent.context,
            assignedTo: parent.assignedTo,
            createdBy: parent.createdBy,
            parentTaskId: parent.taskId,
            recurrenceRule: null,
            raw: JSON.stringify(promotedSubtaskRaw(raw as Record<string, any>, st, childTaskId, parent.taskId, i)),
          });
          subtasksPromoted++;
          i++;
        }

        // Stamp the parent so a re-run skips it — and so the client can hide
        // the "Promote legacy subtasks" button (it reads parent._subtasksPromotedAt).
        const updatedRaw = { ...raw, _subtasksPromotedAt: new Date().toISOString() };
        await db.update(tasksTable)
          .set({ raw: JSON.stringify(updatedRaw) })
          .where(eq(tasksTable.id, parent.id));
      }
      return { parentsScanned, parentsAlreadyDone, subtasksPromoted, dryRun: input.dryRun };
    }),

  runRecurrenceNow: protectedProcedure.mutation(async ({ ctx }) => {
    return processRecurrence({ userId: ctx.user.id });
  }),
});
