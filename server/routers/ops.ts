/**
 * Health & audit (build -233): browsers report their errors here, and the
 * workspace owner reads the error log and the audit log
 * (Settings → Admin → Health & audit). See server/_core/errorLog.ts and
 * server/_core/audit.ts.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { assertOwner } from "../_core/ownerGuard";
import { recordError, readErrors } from "../_core/errorLog";
import { readAudit } from "../_core/audit";

// Per-user cap on client reports: 60 an hour (a broken page can loop).
const perUser = new Map<number, { n: number; at: number }>();

export const opsRouter = router({
  reportClientError: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(1000),
      stack: z.string().max(8000).nullable().optional(),
      where: z.string().max(512).nullable().optional(),
      build: z.string().max(40).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const c = perUser.get(ctx.user.id);
      if (!c || now - c.at > 3600_000) perUser.set(ctx.user.id, { n: 1, at: now });
      else if (++c.n > 60) return { ok: true as const, dropped: true };
      await recordError({
        source: "client",
        message: input.message,
        stack: input.stack ?? null,
        where: input.where ?? null,
        build: input.build ?? null,
        userId: ctx.user.id,
        userAgent: String(ctx.req?.headers?.["user-agent"] || "").slice(0, 255) || null,
      });
      return { ok: true as const };
    }),

  errors: protectedProcedure
    .input(z.object({ sinceHours: z.number().int().min(1).max(24 * 90).default(24 * 7) }).optional())
    .query(async ({ ctx, input }) => {
      await assertOwner(ctx.user);
      return readErrors(input?.sinceHours ?? 24 * 7);
    }),

  auditLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100), before: z.number().int().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      await assertOwner(ctx.user);
      return readAudit(input?.limit ?? 100, input?.before ?? null);
    }),
});
