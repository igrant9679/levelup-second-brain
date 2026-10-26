/**
 * One-time claims across devices (build -231).
 *
 * The assistant's approval cards live in the synced transcript (prefs.aiChat),
 * so the same card can be open on a phone and a laptop. Approving claims
 * (user, "claim:<scope>", key) in send_ledger first — an INSERT on its primary
 * key — so only the first device runs the actions. Reuses the -228 ledger:
 * no migration.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { claimSend } from "../_core/sendLedger";

export const claimsRouter = router({
  once: protectedProcedure
    .input(z.object({ scope: z.enum(["agent"]), key: z.string().min(1).max(40) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return { claimed: await claimSend(db, ctx.user.id, "claim:" + input.scope, input.key) };
    }),
});
