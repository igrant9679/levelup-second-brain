/**
 * Automation rules — Phase 1.
 *
 * Triggers:
 *   - task_overdue_today  (cron, fires daily for tasks past due)
 *   - task_status_done    (cron-poll detection of native tasks newly Done)
 *   - external_status     (when external task status matches a value)
 *
 * Actions:
 *   - set_my_day          actionConfig: {on: bool}
 *   - add_tag             actionConfig: {tag: string}
 *   - set_priority        actionConfig: {priority: 'High'|'Medium'|'Low'}
 *
 * Rule execution lives in a separate worker (automationEngine.ts) tied to
 * the existing 15-min cron. This router only exposes CRUD + manual run.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { automationRules } from "../../drizzle/schema";
import { processAutomations } from "../_core/automationEngine";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

const triggerEnum = z.enum(['task_overdue_today', 'task_status_done', 'external_status']);
const actionEnum = z.enum(['set_my_day', 'add_tag', 'set_priority']);

export const automationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(automationRules)
      .where(eq(automationRules.userId, ctx.user.id));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      trigger: triggerEnum,
      triggerConfig: z.record(z.unknown()).optional(),
      action: actionEnum,
      actionConfig: z.record(z.unknown()).optional(),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.insert(automationRules).values({
        userId: ctx.user.id,
        name: input.name,
        trigger: input.trigger,
        triggerConfig: input.triggerConfig ? JSON.stringify(input.triggerConfig) : null,
        action: input.action,
        actionConfig: input.actionConfig ? JSON.stringify(input.actionConfig) : null,
        enabled: input.enabled ? 1 : 0,
      });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(255).optional(),
      trigger: triggerEnum.optional(),
      triggerConfig: z.record(z.unknown()).nullable().optional(),
      action: actionEnum.optional(),
      actionConfig: z.record(z.unknown()).nullable().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.trigger !== undefined) set.trigger = input.trigger;
      if (input.triggerConfig !== undefined) set.triggerConfig = input.triggerConfig ? JSON.stringify(input.triggerConfig) : null;
      if (input.action !== undefined) set.action = input.action;
      if (input.actionConfig !== undefined) set.actionConfig = input.actionConfig ? JSON.stringify(input.actionConfig) : null;
      if (input.enabled !== undefined) set.enabled = input.enabled ? 1 : 0;
      await db.update(automationRules).set(set)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.delete(automationRules)
        .where(and(eq(automationRules.id, input.id), eq(automationRules.userId, ctx.user.id)));
      return { success: true };
    }),

  runNow: protectedProcedure.mutation(async ({ ctx }) => {
    return processAutomations({ userId: ctx.user.id });
  }),
});
