/**
 * AI coach check-ins — the in-app side of server/_core/coachCron.ts.
 *
 *   coach.inbox        — recent check-ins for the current user (newest first)
 *   coach.markRead     — mark messages read
 *   coach.claimApply   — atomically claim a message's actions so exactly ONE
 *                        device applies them (pending → claimed)
 *   coach.reportApply  — record what the client did (applied | skipped)
 *   coach.runNow       — generate a check-in right now (Settings test button)
 *   coach.status       — AI provider, timezone in use, today's runs, push
 *                        devices, the email-reply mailbox (-220)
 *   coach.checkReplies — read the reply mailbox now instead of waiting ≤3 min
 *   coach.pushKey / pushSubscribe / pushUnsubscribe / pushTest — web push (-213)
 *
 * Check-in SETTINGS are client-owned (prefs.coach.checkins, saved with prefs);
 * the server only reads them, so there is no savePrefs here on purpose.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { coachMessages, userAppData } from "../../drizzle/schema";
import { COACH_KIND_LABELS, COACH_SLOTS, COACH_SLOT_IDS, localNow, processCoachCheckins, slotDay, slotTime, type CoachSlot } from "../_core/coachCron";
import { coachReplyStatus, getReplyInboxAddress, pollCoachReplies } from "../_core/coachReplies";
import { resolveWorkspaceAI } from "../_core/workspaceAI";
// Importing coachPush also registers it as the check-ins' push channel.
import { countPushSubscriptions, getVapidKeys, removePushSubscription, savePushSubscription, sendPushToUser } from "../_core/coachPush";
import { spendQuota } from "../_core/quota";
import { assertOwner } from "../_core/ownerGuard";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

export const coachRouter = router({
  inbox: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20), sinceId: z.number().int().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const where = input?.sinceId
        ? and(eq(coachMessages.userId, ctx.user.id), gt(coachMessages.id, input.sinceId))
        : eq(coachMessages.userId, ctx.user.id);
      const rows = await db.select().from(coachMessages).where(where).orderBy(desc(coachMessages.id)).limit(input?.limit ?? 20);
      return rows.map((r) => ({
        id: r.id, kind: r.kind, label: COACH_KIND_LABELS[r.kind] || r.kind,
        title: r.title, body: r.body, push: r.pushText,
        actions: (() => { try { return r.actions ? JSON.parse(r.actions) : []; } catch { return []; } })(),
        status: r.status, applyState: r.applyState, applyResult: r.applyResult,
        emailed: !!r.emailedAt, pushed: !!r.pushedAt, error: r.error, createdAt: r.createdAt,
        // a reply carries what the user wrote, so the transcript can show it
        ...(r.kind === "reply" ? (() => { try { const m = JSON.parse(r.meta || "{}"); return { userText: String(m.userText || ""), parentId: m.parentId ?? null }; } catch { return {}; } })() : {}),
      }));
    }),

  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(coachMessages).set({ status: "read", readAt: new Date() })
        .where(and(eq(coachMessages.userId, ctx.user.id), inArray(coachMessages.id, input.ids), eq(coachMessages.status, "new")));
      return { ok: true };
    }),

  claimApply: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const res: any = await db.update(coachMessages).set({ applyState: "claimed" })
        .where(and(eq(coachMessages.id, input.id), eq(coachMessages.userId, ctx.user.id), eq(coachMessages.applyState, "pending")));
      const affected = Number(res?.[0]?.affectedRows ?? res?.affectedRows ?? 0);
      return { claimed: affected === 1 };
    }),

  reportApply: protectedProcedure
    .input(z.object({ id: z.number().int(), state: z.enum(["applied", "skipped", "pending"]), result: z.string().max(4000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(coachMessages).set({ applyState: input.state, applyResult: input.result ?? null, appliedAt: input.state === "applied" ? new Date() : null })
        .where(and(eq(coachMessages.id, input.id), eq(coachMessages.userId, ctx.user.id)));
      return { ok: true };
    }),

  runNow: protectedProcedure
    .input(z.object({ slot: z.enum([...COACH_SLOT_IDS, "moneyalert"] as unknown as [string, ...string[]]) }))
    .mutation(async ({ ctx, input }) => {
      // Each manual run is an AI call plus an email/push.
      await spendQuota(ctx.user, "ai");
      await spendQuota(ctx.user, "email");
      const r = await processCoachCheckins({ userId: ctx.user.id, force: input.slot as CoachSlot | "moneyalert" });
      if (!r.created && !r.lastError && input.slot === "moneyalert") return { ok: false, id: null, error: "Nothing in your money is off track right now, so there is no alert to send." };
      return { ok: r.created > 0, id: r.lastId ?? null, error: r.lastError ?? null };
    }),

  // Polls the shared system mailbox for every user: owner only.
  checkReplies: protectedProcedure.mutation(async ({ ctx }) => {
    await assertOwner(ctx.user);
    const r = await pollCoachReplies({ force: true });
    return { ok: r.ok, scanned: r.scanned, matched: r.matched, handled: r.handled, error: r.error ?? null };
  }),

  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [row] = await db.select({ prefs: userAppData.prefs }).from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
    let prefs: any = {};
    try { prefs = row?.prefs ? JSON.parse(row.prefs) : {}; } catch { prefs = {}; }
    const coach = prefs.coach || {};
    const c = coach.checkins || {};
    const local = localNow(coach.tz);
    const ai = await resolveWorkspaceAI();
    const today = await db.select({ id: coachMessages.id, kind: coachMessages.kind, runKey: coachMessages.runKey, createdAt: coachMessages.createdAt, emailedAt: coachMessages.emailedAt, pushedAt: coachMessages.pushedAt, error: coachMessages.error })
      .from(coachMessages).where(eq(coachMessages.userId, ctx.user.id)).orderBy(desc(coachMessages.id)).limit(12);
    return {
      ai: { configured: ai.configured, provider: ai.provider },
      tz: local.tz, tzFromDevice: !!coach.tz, localTime: `${local.weekday} ${local.ymd} ${local.hhmm}`,
      enabled: !!c.enabled,
      schedule: COACH_SLOT_IDS.map((id) => ({ id, label: COACH_SLOTS[id].label, time: slotTime(c, id), on: c.slots?.[id]?.on !== false, ...(COACH_SLOTS[id].day != null ? { day: slotDay(c, id) } : {}) })),
      moneyAlerts: c.slots?.moneyalert?.on !== false,
      recent: today.filter((r) => localNow(local.tz, new Date(r.createdAt)).ymd === local.ymd).map((r) => ({ id: r.id, kind: r.kind, at: r.createdAt, emailed: !!r.emailedAt, pushed: !!r.pushedAt, error: r.error })),
      replies: await (async () => { const st = coachReplyStatus(); return { address: await getReplyInboxAddress().catch(() => null), lastPollAt: st.lastPollAt, lastOkAt: st.lastOkAt, lastError: st.lastError, handled: st.handled }; })(),
      pushDevices: await countPushSubscriptions(ctx.user.id).catch(() => 0),
    };
  }),

  pushKey: protectedProcedure.query(async () => ({ publicKey: (await getVapidKeys()).publicKey })),

  pushSubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(512), p256dh: z.string().min(10).max(255), auth: z.string().min(4).max(255), userAgent: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => { await savePushSubscription(ctx.user.id, input); return { ok: true }; }),

  pushUnsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().max(512) }))
    .mutation(async ({ ctx, input }) => { await removePushSubscription(ctx.user.id, input.endpoint); return { ok: true }; }),

  pushTest: protectedProcedure.mutation(async ({ ctx }) => {
    const r = await sendPushToUser(ctx.user.id, { title: "🧭 LevelUp coach", body: "Push works on this device. Check-ins will arrive here.", url: "/", tag: "coach-test" });
    return r;
  }),
});
