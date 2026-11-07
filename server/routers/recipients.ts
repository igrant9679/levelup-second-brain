/**
 * Alternate email addresses (audit F29) — see server/_core/recipientConfirm.ts.
 *
 *   recipients.status      → { account, owner, confirmedEmails, addresses: [{kind, email, confirmed, confirmedAt}] }
 *                            the alternate addresses set in this user's prefs
 *                            (coach check-ins, daily digest, weekly review)
 *   recipients.sendConfirm({email, kind?}) → { ok, sentTo }
 *                            owner only (nobody else's alternate address is
 *                            ever used); one email from the daily quota
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { assertOwner, isOwner } from "../_core/ownerGuard";
import { spendQuota } from "../_core/quota";
import { RECIPIENT_KINDS, alternateRecipients, confirmedRecipients, sendRecipientConfirm } from "../_core/recipientConfirm";

export const recipientsRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    let prefs: any = {};
    if (db) {
      const [row] = await db.select({ prefs: userAppData.prefs }).from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
      try { prefs = row?.prefs ? JSON.parse(row.prefs) : {}; } catch { prefs = {}; }
    }
    const confirmed = await confirmedRecipients(ctx.user.id);
    const owner = await isOwner(ctx.user);
    return {
      account: ctx.user.email || null,
      owner,
      /** every confirmed address (owner only) — lets a client check an address its prefs haven't synced yet */
      confirmedEmails: owner ? confirmed.map((x) => x.email.toLowerCase()) : [],
      addresses: alternateRecipients(prefs, ctx.user.email).map((a) => {
        const c = confirmed.find((x) => x.email.toLowerCase() === a.email);
        return { kind: a.kind, email: a.email, confirmed: !!c && owner, confirmedAt: c ? c.at : null };
      }),
    };
  }),

  sendConfirm: protectedProcedure
    .input(z.object({ email: z.string().trim().email().max(320), kind: z.enum(RECIPIENT_KINDS as [string, ...string[]]).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx.user);
      const email = input.email.toLowerCase();
      if (ctx.user.email && email === String(ctx.user.email).trim().toLowerCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That is your account address — it needs no confirming." });
      }
      await spendQuota(ctx.user, "email", 1);
      const ok = await sendRecipientConfirm(ctx.user, email, (input.kind as any) || null);
      if (!ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The confirmation email could not be sent — see Settings → Notifications → Email Delivery Log." });
      return { ok: true, sentTo: email };
    }),
});
