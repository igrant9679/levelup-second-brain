/**
 * Server-side AI calls that honour the WORKSPACE's chosen provider + key
 * (Settings → AI Features → system_settings.aiProvider / aiKey_<provider>).
 *
 * Crons have no client to pass a provider/key the way ai.assist does, and the
 * earlier server callers hard-coded provider:'manus' — the Manus/Forge LLM is
 * no longer in use, so those AI blocks silently came back empty. Anything
 * server-side that wants an AI answer should go through callWorkspaceAI.
 */
import { getSystemSetting } from "../db";
import { callAIProvider, type AIProvider } from "./aiProviders";

const PROVIDERS: AIProvider[] = ["openai", "claude", "gemini"];

let _cache: { at: number; provider: AIProvider; apiKey?: string } | null = null;

export async function resolveWorkspaceAI(): Promise<{ provider: AIProvider; apiKey?: string; configured: boolean }> {
  if (_cache && Date.now() - _cache.at < 5 * 60_000) {
    return { provider: _cache.provider, apiKey: _cache.apiKey, configured: !!_cache.apiKey };
  }
  const chosen = String((await getSystemSetting("aiProvider")) || "").trim() as AIProvider;
  let provider: AIProvider = "manus";
  let apiKey: string | undefined;
  // The chosen provider first, then any other provider that has a key.
  const order = PROVIDERS.includes(chosen) ? [chosen, ...PROVIDERS.filter((p) => p !== chosen)] : PROVIDERS;
  for (const p of order) {
    const k = String((await getSystemSetting(`aiKey_${p}`)) || "").trim();
    if (k) { provider = p; apiKey = k; break; }
  }
  _cache = { at: Date.now(), provider, apiKey };
  return { provider, apiKey, configured: !!apiKey };
}

/** Drop the 5-minute cache — aiSettings.set calls this so a new key applies at once. */
export function invalidateWorkspaceAI(): void {
  _cache = null;
}

/**
 * What a browser-initiated AI request (ai.assist / ai.agent / help.askAI /
 * bookmarks.suggest* / oauthSync.suggestFollowUps) should use. Since -214 the
 * browser never holds the workspace keys, so it sends no apiKey and the server
 * resolves the workspace provider + key here (the client's `provider` is then
 * ignored). An explicit apiKey is still honoured with the provider it came
 * with: a pre-214 bundle still open in a tab during deploy skew sends one, and
 * Settings → AI Features "Test" sends a freshly typed key before it is saved.
 */
export async function resolveRequestAI(input: { provider?: string; apiKey?: string }): Promise<{ provider: AIProvider; apiKey?: string }> {
  const explicit = String(input.apiKey || "").trim();
  if (explicit) return { provider: (input.provider || "manus") as AIProvider, apiKey: explicit };
  const { provider, apiKey } = await resolveWorkspaceAI();
  return { provider, apiKey };
}

/** 'sk-…abcd' — enough to recognise a key, never enough to use it. */
export function maskKey(key: string | null | undefined): string {
  const k = String(key || "").trim();
  if (!k) return "";
  const head = k.startsWith("sk-ant-") ? "sk-ant-" : k.startsWith("sk-") ? "sk-" : k.startsWith("AIza") ? "AIza" : "";
  if (k.length < 12) return head + "…";
  return `${head}…${k.slice(-4)}`;
}

export async function callWorkspaceAI(o: { systemPrompt: string; userContent: string; jsonMode?: boolean; maxTokens?: number }): Promise<string> {
  const { provider, apiKey } = await resolveWorkspaceAI();
  const r = await callAIProvider({ provider, apiKey, systemPrompt: o.systemPrompt, userContent: o.userContent, jsonMode: o.jsonMode, maxTokens: o.maxTokens });
  return r.text;
}
