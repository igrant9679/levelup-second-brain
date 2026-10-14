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

export async function callWorkspaceAI(o: { systemPrompt: string; userContent: string; jsonMode?: boolean; maxTokens?: number }): Promise<string> {
  const { provider, apiKey } = await resolveWorkspaceAI();
  const r = await callAIProvider({ provider, apiKey, systemPrompt: o.systemPrompt, userContent: o.userContent, jsonMode: o.jsonMode, maxTokens: o.maxTokens });
  return r.text;
}
