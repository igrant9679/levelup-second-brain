/**
 * Weekly review preferences + manual trigger. Same shape as dailyDigest
 * router — prefs live inside user_app_data.prefs.weeklyReview.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { processWeeklyReview } from "../_core/weeklyReviewEmail";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

interface WeeklyPref {
  enabled?: boolean;
  dayOfWeek?: number;
  time?: string;
  lastSentDate?: string;
  recipientEmail?: string | null;
}

function parsePrefs(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

export const weeklyReviewRouter = router({
  getPrefs: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
    const prefs = parsePrefs(row?.prefs ?? null);
    const wp = (prefs.weeklyReview as WeeklyPref) || {};
    return {
      enabled: !!wp.enabled,
      dayOfWeek: typeof wp.dayOfWeek === 'number' ? wp.dayOfWeek : 5,
      time: wp.time || '16:30',
      lastSentDate: wp.lastSentDate || null,
      recipientEmail: wp.recipientEmail || null,
    };
  }),

  savePrefs: protectedProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).optional(),
      recipientEmail: z.string().email().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
      const prefs = parsePrefs(row?.prefs ?? null);
      const wp = (prefs.weeklyReview as WeeklyPref) || {};
      const merged: WeeklyPref = { ...wp };
      if (input.enabled !== undefined) merged.enabled = input.enabled;
      if (input.dayOfWeek !== undefined) merged.dayOfWeek = input.dayOfWeek;
      if (input.time !== undefined) merged.time = input.time;
      if (input.recipientEmail !== undefined) merged.recipientEmail = input.recipientEmail;
      const newPrefs = { ...prefs, weeklyReview: merged };
      if (row) {
        await db.update(userAppData).set({ prefs: JSON.stringify(newPrefs) }).where(eq(userAppData.userId, ctx.user.id));
      } else {
        await db.insert(userAppData).values({ userId: ctx.user.id, prefs: JSON.stringify(newPrefs) });
      }
      return { success: true, prefs: merged };
    }),

  sendNow: protectedProcedure.mutation(async ({ ctx }) => {
    return processWeeklyReview({ userId: ctx.user.id, force: true });
  }),
});
