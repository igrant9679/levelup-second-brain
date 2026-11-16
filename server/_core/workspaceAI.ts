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

/**
 * MULTI-WORKSPACE (-278). Whose key answers?
 *   1. the workspace's OWN key, if its owner or an admin entered one
 *      (Settings → AI Features → workspace_settings);
 *   2. otherwise the PLATFORM's key — the keys of the platform operator's own
 *      workspace — so a new customer has AI from day one. That use is counted
 *      against the workspace's daily cap (quota.ts).
 * `source` says which: "workspace" | "platform" | "none".
 *
 * The workspace is the one passed, else the one the current work is for
 * (memberContext.ts: every signed-in request, each person's turn in a job),
 * else the platform's. In the tests that predate workspaces it is the old
 * global system_settings rows.
 */
export type ResolvedAI = { provider: AIProvider; apiKey?: string; configured: boolean; source: "workspace" | "platform" | "none" };

const _cache = new Map<string, { at: number; v: ResolvedAI }>();

async function keysFrom(get: (key: string) => Promise<string | undefined>): Promise<{ provider: AIProvider; apiKey?: string }> {
  const chosen = String((await get("aiProvider")) || "").trim() as AIProvider;
  // The chosen provider first, then any other provider that has a key.
  const order = PROVIDERS.includes(chosen) ? [chosen, ...PROVIDERS.filter((p) => p !== chosen)] : PROVIDERS;
  for (const p of order) {
    const k = String((await get(`aiKey_${p}`)) || "").trim();
    if (k) return { provider: p, apiKey: k };
  }
  return { provider: "manus" };
}

export async function resolveWorkspaceAI(wsId?: number | null): Promise<ResolvedAI> {
  if (wsId === undefined) {
    const { currentWorkspaceId } = await import("./memberContext");
    wsId = await currentWorkspaceId();
  }
  const { operatorWorkspaceId } = await import("./mailTrust");
  // No workspace model at all (older unit tests): the global rows.
  const legacy = wsId === null || (wsId === undefined && !!process.env.VITEST && (await operatorWorkspaceId()) == null);
  const key = legacy ? "legacy" : String(wsId ?? "platform");
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.v;
  let v: ResolvedAI;
  if (legacy) {
    const k = await keysFrom((x) => getSystemSetting(x));
    v = { ...k, configured: !!k.apiKey, source: k.apiKey ? "workspace" : "none" };
  } else {
    const { getWorkspaceSetting } = await import("./workspace");
    const platformWs = await operatorWorkspaceId();
    const own = wsId != null && wsId > 0 ? await keysFrom((x) => getWorkspaceSetting(wsId as number, x)) : { provider: "manus" as AIProvider, apiKey: undefined };
    if (own.apiKey) v = { ...own, configured: true, source: "workspace" };
    else if (platformWs != null && platformWs !== wsId) {
      const p = await keysFrom((x) => getWorkspaceSetting(platformWs, x));
      v = { ...p, configured: !!p.apiKey, source: p.apiKey ? "platform" : "none" };
    } else v = { provider: "manus", configured: false, source: "none" };
  }
  _cache.set(key, { at: Date.now(), v });
  return v;
}

/** Drop the 5-minute cache — aiSettings.set calls this so a new key applies at once. */
export function invalidateWorkspaceAI(): void {
  _cache.clear();
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
