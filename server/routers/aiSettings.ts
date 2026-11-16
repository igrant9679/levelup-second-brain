/**
 * aiSettings — workspace-wide shared AI keys + active provider.
 *
 * Storage model: a small set of system_settings rows, owned by the workspace
 * owner. Since -214 the raw keys never leave the server: `get` returns only
 * whether each provider is configured plus a masked hint ('sk-…abcd'), and
 * every AI endpoint resolves the key itself (_core/workspaceAI.ts
 * resolveRequestAI). Writes: the owner and admins (-277, canManageAIKeys).
 * Since -253 invited teammates are members unless the owner grants admin, so
 * the admin role IS a gate again. Every change lands in the audit log.
 *
 * system_settings keys used:
 *   aiKey_openai, aiKey_claude, aiKey_gemini   — provider API keys (encrypted at rest since audit F25; get/setSystemSetting handle it)
 *   aiProvider                                  — active provider id
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invalidateWorkspaceAI, maskKey, resolveWorkspaceAI } from "../_core/workspaceAI";
import { getSettingFor, setSettingFor, wsIdOf } from "../_core/workspace";
import { isOwnerCtxUser } from "./appData";
import { isAdminUser } from "../_core/access";

/** Owner or an admin the owner granted (-277). Members can only use the keys. */
export async function canManageAIKeys(user: any): Promise<boolean> {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return await isOwnerCtxUser(user);
}

const PROVIDERS = ["openai", "claude", "gemini"] as const;
type Provider = typeof PROVIDERS[number];

export const aiSettingsRouter = router({
  /**
   * The workspace's AI status for every signed-in user: active provider, and
   * per provider {configured, hint}. Never the raw key. `canEdit` tells the
   * Settings pane whether to offer the "replace key" inputs.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    // THIS workspace's own keys (-278). When it has none, AI still works on
    // LevelUp's keys (`usingPlatform`), within the workspace's daily limit.
    const [openai, claude, gemini, provider] = await Promise.all([
      getSettingFor(ctx.user as any, "aiKey_openai"),
      getSettingFor(ctx.user as any, "aiKey_claude"),
      getSettingFor(ctx.user as any, "aiKey_gemini"),
      getSettingFor(ctx.user as any, "aiProvider"),
    ]);
    const status = (k: string | undefined) => ({ configured: !!String(k || "").trim(), hint: maskKey(k) });
    const w = await wsIdOf(ctx.user as any);
    const resolved = await resolveWorkspaceAI(w);
    return {
      provider: (provider as Provider) || (resolved.source === "platform" ? (resolved.provider as Provider) : "openai"),
      keys: { openai: status(openai), claude: status(claude), gemini: status(gemini) },
      canEdit: await canManageAIKeys(ctx.user as any),
      /** AI is answering on LevelUp's keys because this workspace entered none of its own. */
      usingPlatform: resolved.source === "platform",
      aiAvailable: resolved.configured,
    };
  }),

  /**
   * Update one or more shared AI settings. Owner and admins. Empty
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
      if (!(await canManageAIKeys(ctx.user as any))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the workspace owner or an admin can change the AI keys" });
      }
      if (input.provider !== undefined) await setSettingFor(ctx.user as any, "aiProvider", input.provider);
      if (input.openai !== undefined) await setSettingFor(ctx.user as any, "aiKey_openai", input.openai.trim());
      if (input.claude !== undefined) await setSettingFor(ctx.user as any, "aiKey_claude", input.claude.trim());
      if (input.gemini !== undefined) await setSettingFor(ctx.user as any, "aiKey_gemini", input.gemini.trim());
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
    .mutation(async ({ ctx, input }) => {
      const apiKey = String((await getSettingFor(ctx.user as any, `aiKey_${input.provider}`)) || "").trim();
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
