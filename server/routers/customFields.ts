/**
 * Custom fields per project + per-task values.
 *
 * Endpoints:
 *   customFields.listForProject(projectId)  — field defs scoped to a project
 *   customFields.createField(projectId, name, type, options?)
 *   customFields.updateField(fieldId, ...)
 *   customFields.deleteField(fieldId)
 *   customFields.getValuesForTask(taskId)
 *   customFields.setValue(taskId, fieldId, value)
 *   customFields.allValuesForProject(projectId) — bulk fetch for list/board
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { projectCustomFieldDefs, taskCustomFieldValues } from "../../drizzle/schema";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

const fieldTypeEnum = z.enum(['text', 'number', 'select', 'date']);

export const customFieldsRouter = router({
  listForProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rows = await db.select().from(projectCustomFieldDefs)
        .where(and(eq(projectCustomFieldDefs.userId, ctx.user.id), eq(projectCustomFieldDefs.projectId, input.projectId)));
      return rows.sort((a, b) => a.sortOrder - b.sortOrder);
    }),

  createField: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      name: z.string().min(1).max(128),
      type: fieldTypeEnum.default('text'),
      options: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const existing = await db.select().from(projectCustomFieldDefs)
        .where(and(eq(projectCustomFieldDefs.userId, ctx.user.id), eq(projectCustomFieldDefs.projectId, input.projectId)));
      const sortOrder = existing.length;
      const res = await db.insert(projectCustomFieldDefs).values({
        userId: ctx.user.id,
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        options: input.options ? JSON.stringify(input.options) : null,
        sortOrder,
      });
      return { success: true, insertId: res[0]?.insertId };
    }),

  updateField: protectedProcedure
    .input(z.object({
      fieldId: z.number().int(),
      name: z.string().min(1).max(128).optional(),
      type: fieldTypeEnum.optional(),
      options: z.array(z.string()).nullable().optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.type !== undefined) set.type = input.type;
      if (input.options !== undefined) set.options = input.options ? JSON.stringify(input.options) : null;
      if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;
      await db.update(projectCustomFieldDefs).set(set)
        .where(and(eq(projectCustomFieldDefs.id, input.fieldId), eq(projectCustomFieldDefs.userId, ctx.user.id)));
      return { success: true };
    }),

  deleteField: protectedProcedure
    .input(z.object({ fieldId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Cascade delete values for this field.
      await db.delete(taskCustomFieldValues)
        .where(and(eq(taskCustomFieldValues.userId, ctx.user.id), eq(taskCustomFieldValues.fieldId, input.fieldId)));
      await db.delete(projectCustomFieldDefs)
        .where(and(eq(projectCustomFieldDefs.id, input.fieldId), eq(projectCustomFieldDefs.userId, ctx.user.id)));
      return { success: true };
    }),

  getValuesForTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rows = await db.select().from(taskCustomFieldValues)
        .where(and(eq(taskCustomFieldValues.userId, ctx.user.id), eq(taskCustomFieldValues.taskId, input.taskId)));
      const out: Record<string, string | null> = {};
      for (const r of rows) out[String(r.fieldId)] = r.value;
      return out;
    }),

  setValue: protectedProcedure
    .input(z.object({
      taskId: z.string().max(40),
      fieldId: z.number().int(),
      value: z.string().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      if (input.value === null || input.value === '') {
        await db.delete(taskCustomFieldValues)
          .where(and(eq(taskCustomFieldValues.userId, ctx.user.id), eq(taskCustomFieldValues.taskId, input.taskId), eq(taskCustomFieldValues.fieldId, input.fieldId)));
      } else {
        await db.insert(taskCustomFieldValues).values({
          userId: ctx.user.id,
          taskId: input.taskId,
          fieldId: input.fieldId,
          value: input.value,
        }).onDuplicateKeyUpdate({ set: { value: input.value } });
      }
      return { success: true };
    }),

  allValuesForProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const defs = await db.select().from(projectCustomFieldDefs)
        .where(and(eq(projectCustomFieldDefs.userId, ctx.user.id), eq(projectCustomFieldDefs.projectId, input.projectId)));
      if (!defs.length) return { fields: [], values: {} };
      const fieldIds = defs.map(d => d.id);
      const vals = await db.select().from(taskCustomFieldValues)
        .where(and(eq(taskCustomFieldValues.userId, ctx.user.id), inArray(taskCustomFieldValues.fieldId, fieldIds)));
      const byTask: Record<string, Record<string, string | null>> = {};
      for (const v of vals) {
        if (!byTask[v.taskId]) byTask[v.taskId] = {};
        byTask[v.taskId][String(v.fieldId)] = v.value;
      }
      return { fields: defs, values: byTask };
    }),
});
