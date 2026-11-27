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
 *   aiKey_openai, aiKey_claude, aiKey_gemini, aiKey_openrouter — provider API keys (encrypted at rest since audit F25; get/setSystemSetting handle it)
 *   aiProvider                                  — active provider id
 *   aiModel_openrouter                          — the OpenRouter model picked in Settings (not a secret)
 *
 * OpenRouter (2026-11-27): a key is checked with OpenRouter's key-info endpoint
 * (GET /api/v1/key) before it is saved — a key OpenRouter refuses is not saved,
 * and a good one comes back as "valid" with the credit left on it.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { operatorProcedure, protectedProcedure, router } from "../_core/trpc";
import { invalidateWorkspaceAI, maskKey, OR_MODEL_KEY, platformAIStatus, platformKeys, platformOpenRouterKey, resolveWorkspaceAI, setPlatformAI } from "../_core/workspaceAI";
import { getSettingFor, setSettingFor, wsIdOf } from "../_core/workspace";
import { isOwnerCtxUser } from "./appData";
import { isAdminUser } from "../_core/access";
import { checkOpenRouterKey, isModelId, listOpenRouterModels, modelInfo, OpenRouterError, pickDefaultModel, textModels } from "../_core/openRouter";

/** Owner or an admin the owner granted (-277). Members can only use the keys. */
export async function canManageAIKeys(user: any): Promise<boolean> {
  if (!user) return false;
  // These are THIS workspace's keys only. Since -289 the keys other workspaces fall back on are
  // LevelUp's own (platformGet / platformSet below, operator only) — so admins managing their
  // workspace's keys (-277) can no longer touch anyone else's AI (Audit 3, O9).
  if (isAdminUser(user)) return true;
  return await isOwnerCtxUser(user);
}

const PROVIDERS = ["openai", "claude", "gemini", "openrouter"] as const;
type Provider = typeof PROVIDERS[number];

const keyField = z.string().max(512).optional();
/** An OpenRouter model id ("vendor/model"), or "" to go back to the default. */
const modelField = z.string().max(200).optional().refine((v) => v === undefined || v.trim() === "" || isModelId(v.trim()), { message: "That is not an OpenRouter model id" });

export type OpenRouterKeyStatus = { checked: true; valid: true; limit: number | null; limitRemaining: number | null; usage: number | null } | { checked: false; error: string };

/**
 * Ask OpenRouter about a key before it is saved. A key it refuses (401 / 403)
 * throws — with OpenRouter's own message — and is not saved. When OpenRouter
 * cannot be reached the key is saved and the answer says it was not checked.
 * Only the credit figures come back, never the key or its label.
 */
export async function checkOpenRouterKeyForSave(key: string): Promise<OpenRouterKeyStatus> {
  try {
    const c = await checkOpenRouterKey(key);
    return { checked: true, valid: true, limit: c.limit, limitRemaining: c.limitRemaining, usage: c.usage };
  } catch (e) {
    if (e instanceof OpenRouterError && (e.status === 401 || e.status === 403)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${e.message.replace(/\.$/, "")}. The key was not saved.` });
    }
    return { checked: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const aiSettingsRouter = router({
  /**
   * The workspace's AI status for every signed-in user: active provider, and
   * per provider {configured, hint}. Never the raw key. `canEdit` tells the
   * Settings pane whether to offer the "replace key" inputs.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    // THIS workspace's own keys (-278). When it has none, AI still works on
    // LevelUp's keys (`usingPlatform`), within the workspace's daily limit.
    const [openai, claude, gemini, openrouter, provider, orModel] = await Promise.all([
      getSettingFor(ctx.user as any, "aiKey_openai"),
      getSettingFor(ctx.user as any, "aiKey_claude"),
      getSettingFor(ctx.user as any, "aiKey_gemini"),
      getSettingFor(ctx.user as any, "aiKey_openrouter"),
      getSettingFor(ctx.user as any, "aiProvider"),
      getSettingFor(ctx.user as any, OR_MODEL_KEY),
    ]);
    const status = (k: string | undefined) => ({ configured: !!String(k || "").trim(), hint: maskKey(k) });
    const w = await wsIdOf(ctx.user as any);
    const resolved = await resolveWorkspaceAI(w);
    return {
      provider: (provider as Provider) || (resolved.source === "platform" ? (resolved.provider as Provider) : "openai"),
      keys: { openai: status(openai), claude: status(claude), gemini: status(gemini), openrouter: status(openrouter) },
      canEdit: await canManageAIKeys(ctx.user as any),
      /** AI is answering on LevelUp's keys because this workspace entered none of its own. */
      usingPlatform: resolved.source === "platform",
      aiAvailable: resolved.configured,
      openrouter: {
        /** This workspace's model pick ("" = LevelUp's default). */
        model: String(orModel || "").trim(),
        /** LevelUp has a shared OpenRouter key, so choosing OpenRouter works without a key of your own. */
        sharedKey: !!(await platformOpenRouterKey()),
        /** The model the workspace's OpenRouter calls use right now (null when OpenRouter isn't what answers). */
        inUse: resolved.provider === "openrouter" ? (resolved.model || null) : null,
        onSharedKey: resolved.provider === "openrouter" && resolved.source === "platform",
      },
    };
  }),

  /**
   * Update one or more shared AI settings. Owner and admins. Empty
   * string clears. A new OpenRouter key is checked with OpenRouter first.
   */
  set: protectedProcedure
    .input(z.object({
      provider: z.enum(PROVIDERS).optional(),
      openai: keyField,
      claude: keyField,
      gemini: keyField,
      openrouter: keyField,
      openrouterModel: modelField,
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await canManageAIKeys(ctx.user as any))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the workspace owner or an admin can change the AI keys" });
      }
      const orKey = input.openrouter !== undefined ? input.openrouter.trim() : undefined;
      const check = orKey ? await checkOpenRouterKeyForSave(orKey) : undefined; // throws before anything is saved
      if (input.provider !== undefined) await setSettingFor(ctx.user as any, "aiProvider", input.provider);
      if (input.openai !== undefined) await setSettingFor(ctx.user as any, "aiKey_openai", input.openai.trim());
      if (input.claude !== undefined) await setSettingFor(ctx.user as any, "aiKey_claude", input.claude.trim());
      if (input.gemini !== undefined) await setSettingFor(ctx.user as any, "aiKey_gemini", input.gemini.trim());
      if (orKey !== undefined) await setSettingFor(ctx.user as any, "aiKey_openrouter", orKey);
      if (input.openrouterModel !== undefined) await setSettingFor(ctx.user as any, OR_MODEL_KEY, input.openrouterModel.trim());
      invalidateWorkspaceAI();
      return { success: true, ...(check ? { openrouter: check } : {}) };
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
      // Audit 3: a failing key falls back to the built-in model, so a test counts like any AI request
      await (await import("../_core/quota")).spendQuota(ctx.user as any, "ai");
      const { callAIProvider } = await import("../_core/aiProviders");
      const model = input.provider === "openrouter" ? String((await getSettingFor(ctx.user as any, OR_MODEL_KEY)) || "").trim() || undefined : undefined;
      const { text, providerUsed, model: answered } = await callAIProvider({
        provider: input.provider,
        apiKey,
        model,
        systemPrompt: "You are a helpful assistant.",
        userContent: "Reply with exactly: OK",
      });
      // callAIProvider falls back to Manus on a provider error; that is not a
      // passing test of THIS key.
      if (providerUsed !== input.provider) throw new Error(`${input.provider} did not answer`);
      return { ok: !!text, ...(answered ? { model: answered } : {}) };
    }),

  /**
   * OpenRouter's models for the picker (GET https://openrouter.ai/api/v1/models,
   * no key, cached for 6 hours on the server): id, name, context, price per
   * million tokens in / out, and whether the model can give structured (JSON)
   * answers. `structuredOnly` returns only those. `defaultModel` = the newest
   * Claude Sonnet that supports tools.
   */
  openRouterModels: protectedProcedure
    .input(z.object({ structuredOnly: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const list = textModels(await listOpenRouterModels());
      const models = list.map(modelInfo).filter((m) => !input?.structuredOnly || m.structured).sort((a, b) => a.name.localeCompare(b.name));
      return { available: list.length > 0, defaultModel: pickDefaultModel(list), models };
    }),

  // ── LevelUp's own keys (build -289): the fallback for every workspace without one. Operator only. ──
  /** Which provider and which keys are saved (masked hints, never a key). */
  platformGet: operatorProcedure.query(async () => platformAIStatus()),

  /** Change LevelUp's own keys. Empty string clears. Audited. A new OpenRouter key is checked first. */
  platformSet: operatorProcedure
    .input(z.object({
      provider: z.enum(PROVIDERS).optional(),
      openai: keyField,
      claude: keyField,
      gemini: keyField,
      openrouter: keyField,
      openrouterModel: modelField,
      openrouterAnyModel: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const orKey = input.openrouter !== undefined ? input.openrouter.trim() : "";
      const check = orKey ? await checkOpenRouterKeyForSave(orKey) : undefined;
      await setPlatformAI(input);   // audited by the procedure map in _core/audit.ts
      return { ...(await platformAIStatus()), ...(check ? { check } : {}) };
    }),

  /** Ask a saved platform key for "OK" — the operator's check that customers' AI works. */
  platformTest: operatorProcedure
    .input(z.object({ provider: z.enum(PROVIDERS) }))
    .mutation(async ({ input }) => {
      const { getSystemSetting } = await import("../db");
      const apiKey = String((await getSystemSetting(`platformAiKey_${input.provider}`)) || "").trim();
      if (!apiKey) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `No ${input.provider} key is saved for LevelUp` });
      const { callAIProvider } = await import("../_core/aiProviders");
      const model = input.provider === "openrouter" ? String((await getSystemSetting("platformAiModel_openrouter")) || "").trim() || undefined : undefined;
      const { text, providerUsed, model: answered } = await callAIProvider({ provider: input.provider, apiKey, model, systemPrompt: "You are a helpful assistant.", userContent: "Reply with exactly: OK" });
      if (providerUsed !== input.provider) throw new Error(`${input.provider} did not answer`);
      const active = await platformKeys();
      return { ok: !!text, inUse: active.provider === input.provider, ...(answered ? { model: answered } : {}) };
    }),
});
