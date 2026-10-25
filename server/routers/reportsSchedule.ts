/**
 * Scheduled report emails, client side of the send ledger (build -228).
 *
 * An open tab renders the full report (charts and all) and can email it at
 * the scheduled time, while the hourly server cron sends a lighter version
 * for when no tab is open. Both claim (user, "report:<id>", period) in
 * send_ledger first — whoever gets the claim sends, so a report goes out
 * once. The tab calls `claim` before sending and `release` if the send fails.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { claimScheduledReport, releaseScheduledReport } from "../_core/scheduledReports";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

export const reportsScheduleRouter = router({
  claim: protectedProcedure
    .input(z.object({ reportId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, ctx.user.id)).limit(1);
      let prefs: Record<string, unknown> = {};
      try { prefs = JSON.parse(row?.prefs || "{}"); } catch { /* empty */ }
      return claimScheduledReport(db, ctx.user.id, prefs, input.reportId);
    }),

  release: protectedProcedure
    .input(z.object({ reportId: z.string().min(1).max(64), period: z.string().min(1).max(40) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await releaseScheduledReport(db, ctx.user.id, input.reportId, input.period);
      return { ok: true };
    }),
});
