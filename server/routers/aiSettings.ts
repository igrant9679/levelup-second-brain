/**
 * aiSettings — workspace-wide shared AI keys + active provider.
 *
 * Storage model: a small set of system_settings rows, owned by the admin.
 * Any authenticated user can read these so client-side AI features work
 * without each team member having to enter their own key. Writes are
 * admin-only.
 *
 * system_settings keys used:
 *   aiKey_openai, aiKey_claude, aiKey_gemini   — provider API keys (plaintext)
 *   aiProvider                                  — active provider id
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const PROVIDERS = ["openai", "claude", "gemini"] as const;
type Provider = typeof PROVIDERS[number];

export const aiSettingsRouter = router({
  /**
   * Read the workspace's shared AI keys + active provider. Available to all
   * authenticated users so the client AI helpers can use the admin-managed
   * keys without per-user entry.
   */
  get: protectedProcedure.query(async () => {
    const [openai, claude, gemini, provider] = await Promise.all([
      db.getSystemSetting("aiKey_openai"),
      db.getSystemSetting("aiKey_claude"),
      db.getSystemSetting("aiKey_gemini"),
      db.getSystemSetting("aiProvider"),
    ]);
    return {
      keys: {
        openai: openai ?? "",
        claude: claude ?? "",
        gemini: gemini ?? "",
      },
      provider: (provider as Provider) ?? "openai",
    };
  }),

  /**
   * Update one or more shared AI settings. Admin-only. Empty string clears.
   */
  set: protectedProcedure
    .input(z.object({
      provider: z.enum(PROVIDERS).optional(),
      openai: z.string().optional(),
      claude: z.string().optional(),
      gemini: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      if (input.provider !== undefined) await db.setSystemSetting("aiProvider", input.provider);
      if (input.openai !== undefined) await db.setSystemSetting("aiKey_openai", input.openai);
      if (input.claude !== undefined) await db.setSystemSetting("aiKey_claude", input.claude);
      if (input.gemini !== undefined) await db.setSystemSetting("aiKey_gemini", input.gemini);
      return { success: true };
    }),
});
