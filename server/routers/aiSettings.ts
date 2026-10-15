/**
 * aiSettings — workspace-wide shared AI keys + active provider.
 *
 * Storage model: a small set of system_settings rows, owned by the workspace
 * owner. Since -214 the raw keys never leave the server: `get` returns only
 * whether each provider is configured plus a masked hint ('sk-…abcd'), and
 * every AI endpoint resolves the key itself (_core/workspaceAI.ts
 * resolveRequestAI). Writes are owner-only (isOwnerCtxUser — teammates are
 * all admins, so role==='admin' is not a gate).
 *
 * system_settings keys used:
 *   aiKey_openai, aiKey_claude, aiKey_gemini   — provider API keys (plaintext)
 *   aiProvider                                  — active provider id
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { invalidateWorkspaceAI, maskKey } from "../_core/workspaceAI";
import { isOwnerCtxUser } from "./appData";

const PROVIDERS = ["openai", "claude", "gemini"] as const;
type Provider = typeof PROVIDERS[number];

export const aiSettingsRouter = router({
  /**
   * The workspace's AI status for every signed-in user: active provider, and
   * per provider {configured, hint}. Never the raw key. `canEdit` tells the
   * Settings pane whether to offer the "replace key" inputs.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const [openai, claude, gemini, provider] = await Promise.all([
      db.getSystemSetting("aiKey_openai"),
      db.getSystemSetting("aiKey_claude"),
      db.getSystemSetting("aiKey_gemini"),
      db.getSystemSetting("aiProvider"),
    ]);
    const status = (k: string | undefined) => ({ configured: !!String(k || "").trim(), hint: maskKey(k) });
    return {
      provider: (provider as Provider) || "openai",
      keys: { openai: status(openai), claude: status(claude), gemini: status(gemini) },
      canEdit: await isOwnerCtxUser(ctx.user as any),
    };
  }),

  /**
   * Update one or more shared AI settings. Workspace owner only. Empty
   * string clears.
   */
  set: protectedProcedure
    .input(z.object({
      provider: z.enum(PROVIDERS).optional(),
      openai: z.string().max(512).optional(),
      claude: z.string().max(512).optional(),
      gemini: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isOwnerCtxUser(ctx.user as any))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the workspace owner can change the AI keys" });
      }
      if (input.provider !== undefined) await db.setSystemSetting("aiProvider", input.provider);
      if (input.openai !== undefined) await db.setSystemSetting("aiKey_openai", input.openai.trim());
      if (input.claude !== undefined) await db.setSystemSetting("aiKey_claude", input.claude.trim());
      if (input.gemini !== undefined) await db.setSystemSetting("aiKey_gemini", input.gemini.trim());
      invalidateWorkspaceAI();
      return { success: true };
    }),

  /**
   * Settings → AI Features "Test" for a key that is already saved (the
   * browser no longer has it to send). A freshly typed key is tested by
   * passing it to ai.assist directly.
   */
  test: protectedProcedure
    .input(z.object({ provider: z.enum(PROVIDERS) }))
    .mutation(async ({ input }) => {
      const apiKey = String((await db.getSystemSetting(`aiKey_${input.provider}`)) || "").trim();
      if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `No ${input.provider} key is saved` });
      const { callAIProvider } = await import("../_core/aiProviders");
      const { text, providerUsed } = await callAIProvider({
        provider: input.provider,
        apiKey,
        systemPrompt: "You are a helpful assistant.",
        userContent: "Reply with exactly: OK",
      });
      // callAIProvider falls back to Manus on a provider error; that is not a
      // passing test of THIS key.
      if (providerUsed !== input.provider) throw new Error(`${input.provider} did not answer`);
      return { ok: !!text };
    }),
});
