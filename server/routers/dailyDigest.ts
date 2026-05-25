/**
 * Daily-digest preferences + manual trigger.
 *
 * Prefs live inside the existing user_app_data.prefs JSON blob at
 * prefs.dailyDigest = { enabled, time, lastSentDate, recipientEmail }.
 * Storing inside prefs keeps the schema unchanged and rides existing
 * appData sync paths. The cron in dailyDigestEmail.ts reads + writes the
 * same key.
 *
 * Procedures:
 *   dailyDigest.getPrefs   — return current pref object (defaults if unset)
 *   dailyDigest.savePrefs  — partial-merge user-supplied fields
 *   dailyDigest.sendNow    — force-send to the current user right now
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { processDailyDigest } from "../_core/dailyDigestEmail";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

interface DigestPref {
  enabled?: boolean;
  time?: string;
  lastSentDate?: string;
  recipientEmail?: string | null;
}

function parsePrefs(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

export const dailyDigestRouter = router({
  getPrefs: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
    const prefs = parsePrefs(row?.prefs ?? null);
    const dp = (prefs.dailyDigest as DigestPref) || {};
    return {
      enabled: !!dp.enabled,
      time: dp.time || '07:00',
      lastSentDate: dp.lastSentDate || null,
      recipientEmail: dp.recipientEmail || null,
    };
  }),

  savePrefs: protectedProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).optional(),
      recipientEmail: z.string().email().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
      const prefs = parsePrefs(row?.prefs ?? null);
      const dp = (prefs.dailyDigest as DigestPref) || {};
      const merged: DigestPref = { ...dp };
      if (input.enabled !== undefined) merged.enabled = input.enabled;
      if (input.time !== undefined) merged.time = input.time;
      if (input.recipientEmail !== undefined) merged.recipientEmail = input.recipientEmail;
      const newPrefs = { ...prefs, dailyDigest: merged };
      if (row) {
        await db.update(userAppData).set({ prefs: JSON.stringify(newPrefs) }).where(eq(userAppData.userId, ctx.user.id));
      } else {
        // Edge case: user has no user_app_data row yet. Insert a minimal one
        // so the digest can run before the user makes their first task save.
        await db.insert(userAppData).values({
          userId: ctx.user.id,
          prefs: JSON.stringify(newPrefs),
        });
      }
      return { success: true, prefs: merged };
    }),

  sendNow: protectedProcedure.mutation(async ({ ctx }) => {
    return processDailyDigest({ userId: ctx.user.id, force: true });
  }),
});
