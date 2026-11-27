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

/** The providers a key can be saved for (same list as aiProviders.KEYED_PROVIDERS). */
const PROVIDERS: AIProvider[] = ["openai", "claude", "gemini", "openrouter"];

/**
 * OPENROUTER (2026-11-27, owner decisions shared by all four apps).
 *   - A workspace that chose OpenRouter uses its OWN OpenRouter key first, otherwise
 *     LevelUp's shared OpenRouter key (system_settings `platformAiKey_openrouter`,
 *     encrypted, set by the operator in Platform console → LevelUp's AI keys; the
 *     owner pays for it, so it counts against the daily AI allowance like every
 *     platform key).
 *   - The shared OpenRouter key is never picked up silently as everyone's default:
 *     for workspaces without a key LevelUp keeps today's default until the operator
 *     sets "Use first" (`platformAiProvider`) to OpenRouter.
 *   - Model: `aiModel_openrouter` (the workspace's pick, used with its own key) and
 *     `platformAiModel_openrouter` (LevelUp's pick, used on the shared key). With
 *     `platformAiOpenRouterAnyModel` = "1" a workspace's pick also applies on the
 *     shared key. No pick → the newest Claude Sonnet that supports tools (openRouter.ts).
 */
export const OR_MODEL_KEY = "aiModel_openrouter";
export const OR_PLATFORM_MODEL_KEY = "platformAiModel_openrouter";
export const OR_PLATFORM_ANY_MODEL_KEY = "platformAiOpenRouterAnyModel";

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
export type ResolvedAI = { provider: AIProvider; apiKey?: string; configured: boolean; source: "workspace" | "platform" | "none"; model?: string };

const _cache = new Map<string, { at: number; v: ResolvedAI }>();

async function keysFrom(get: (key: string) => Promise<string | undefined>, opts: { platform?: boolean } = {}): Promise<{ provider: AIProvider; apiKey?: string }> {
  const chosen = String((await get("aiProvider")) || "").trim() as AIProvider;
  // LevelUp's shared OpenRouter key only answers as the default when the operator chose it.
  const pool = opts.platform && chosen !== "openrouter" ? PROVIDERS.filter((p) => p !== "openrouter") : PROVIDERS;
  // The chosen provider first, then any other provider that has a key.
  const order = pool.includes(chosen) ? [chosen, ...pool.filter((p) => p !== chosen)] : pool;
  for (const p of order) {
    const k = String((await get(`aiKey_${p}`)) || "").trim();
    if (k) return { provider: p, apiKey: k };
  }
  return { provider: "manus" };
}

/**
 * PLATFORM AI KEYS (build -289). The keys every workspace without its own falls back on are
 * LevelUp's own, kept in system_settings (`platformAiProvider`, `platformAiKey_<provider>`,
 * encrypted at rest like every AI key) and changed ONLY by the platform operator (Platform
 * console → LevelUp's AI keys). Before -289 they were simply the operator workspace's keys, which
 * that workspace's admins can change (-277) — so an admin there could cut off or swap the AI of
 * every customer (Audit 3, O9). The operator workspace's own keys are now just its own.
 *
 * Moving over: until the operator has saved platform keys once (`platformAiKeysSet`), the first
 * lookup copies the operator workspace's keys as they are, so customers' AI carries on through
 * the deploy. From then on a change in that workspace no longer reaches anyone else.
 */
export const PLATFORM_AI_FLAG = "platformAiKeysSet";
let _platformReady = false;

async function ensurePlatformKeys(): Promise<void> {
  if (_platformReady) return;
  if (await getSystemSetting(PLATFORM_AI_FLAG)) { _platformReady = true; return; }
  const { operatorWorkspaceId } = await import("./mailTrust");
  const { getWorkspaceSetting } = await import("./workspace");
  const opWs = await operatorWorkspaceId();
  if (opWs == null) return;                       // no operator yet — try again on a later lookup
  const vals: Record<string, string> = {};
  for (const p of PROVIDERS) {
    const k = String((await getWorkspaceSetting(opWs, `aiKey_${p}`)) || "").trim();
    if (k) vals[p] = k;
  }
  if (!Object.keys(vals).length) return;           // nothing to copy yet — leave the flag unset
  const { setSystemSetting } = await import("../db");
  for (const [p, k] of Object.entries(vals)) await setSystemSetting(`platformAiKey_${p}`, k);
  const prov = String((await getWorkspaceSetting(opWs, "aiProvider")) || "").trim();
  if (prov) await setSystemSetting("platformAiProvider", prov);
  await setSystemSetting(PLATFORM_AI_FLAG, JSON.stringify({ at: new Date().toISOString(), copiedFrom: opWs, providers: Object.keys(vals) }));
  _platformReady = true;
  console.log(`[ai] platform AI keys copied once from the operator's workspace #${opWs} (${Object.keys(vals).join(", ")}); from now on only the operator changes them`);
}

/** LevelUp's own keys (the fallback for workspaces without one). */
export async function platformKeys(): Promise<{ provider: AIProvider; apiKey?: string }> {
  await ensurePlatformKeys();
  return keysFrom(async (x) => getSystemSetting(x === "aiProvider" ? "platformAiProvider" : `platform${x.charAt(0).toUpperCase()}${x.slice(1)}`), { platform: true });
}

const settingText = async (k: string): Promise<string | undefined> => String((await getSystemSetting(k)) || "").trim() || undefined;

/** LevelUp's shared OpenRouter key (owner-paid), or undefined. */
export async function platformOpenRouterKey(): Promise<string | undefined> {
  return settingText("platformAiKey_openrouter");
}

/** The model used on LevelUp's shared OpenRouter key: the workspace's pick when the operator allows it, else LevelUp's. */
async function sharedOpenRouterModel(workspacePick: string | undefined): Promise<string | undefined> {
  if (workspacePick && (await settingText(OR_PLATFORM_ANY_MODEL_KEY)) === "1") return workspacePick;
  return settingText(OR_PLATFORM_MODEL_KEY);
}

/** For the Platform console: chosen provider + per provider whether a key is saved (masked hint, never the key). */
export async function platformAIStatus(): Promise<{ provider: AIProvider | ""; keys: Record<string, { configured: boolean; hint: string }>; set: boolean; copiedFrom: number | null; active: { provider: AIProvider; configured: boolean }; openrouter: { model: string; anyModel: boolean } }> {
  await ensurePlatformKeys();
  const keys: Record<string, { configured: boolean; hint: string }> = {};
  for (const p of PROVIDERS) {
    const k = String((await getSystemSetting(`platformAiKey_${p}`)) || "").trim();
    keys[p] = { configured: !!k, hint: maskKey(k) };
  }
  let flag: any = null;
  try { const f = await getSystemSetting(PLATFORM_AI_FLAG); flag = f ? JSON.parse(f) : null; } catch { flag = null; }
  const a = await platformKeys();
  return {
    provider: (String((await getSystemSetting("platformAiProvider")) || "") as AIProvider) || "",
    keys, set: !!flag, copiedFrom: flag && flag.copiedFrom != null && !flag.savedAt ? Number(flag.copiedFrom) : null,
    active: { provider: a.provider, configured: !!a.apiKey },
    openrouter: { model: (await settingText(OR_PLATFORM_MODEL_KEY)) || "", anyModel: (await settingText(OR_PLATFORM_ANY_MODEL_KEY)) === "1" },
  };
}

/** Operator only (the router checks): change LevelUp's own keys. "" clears a key. */
export async function setPlatformAI(input: { provider?: AIProvider; openai?: string; claude?: string; gemini?: string; openrouter?: string; openrouterModel?: string; openrouterAnyModel?: boolean }): Promise<void> {
  const { setSystemSetting } = await import("../db");
  await ensurePlatformKeys();
  if (input.provider !== undefined) await setSystemSetting("platformAiProvider", input.provider);
  for (const p of PROVIDERS) {
    const v = (input as any)[p];
    if (v !== undefined) await setSystemSetting(`platformAiKey_${p}`, String(v).trim());
  }
  if (input.openrouterModel !== undefined) await setSystemSetting(OR_PLATFORM_MODEL_KEY, String(input.openrouterModel).trim());
  if (input.openrouterAnyModel !== undefined) await setSystemSetting(OR_PLATFORM_ANY_MODEL_KEY, input.openrouterAnyModel ? "1" : "");
  let flag: any = {};
  try { const f = await getSystemSetting(PLATFORM_AI_FLAG); flag = f ? JSON.parse(f) : {}; } catch { flag = {}; }
  await setSystemSetting(PLATFORM_AI_FLAG, JSON.stringify({ ...flag, savedAt: new Date().toISOString() }));
  _platformReady = true;
  invalidateWorkspaceAI();
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
  let get: (x: string) => Promise<string | undefined>;
  if (legacy) get = (x) => getSystemSetting(x);
  else {
    const { getWorkspaceSetting } = await import("./workspace");
    const w = wsId;
    get = w != null && w > 0 ? (x) => getWorkspaceSetting(w, x) : async () => undefined;
  }
  v = await resolveWith(get, legacy);
  _cache.set(key, { at: Date.now(), v });
  return v;
}

/**
 * The key order, given how to read the workspace's own settings:
 *   1. chose OpenRouter → its own OpenRouter key, else LevelUp's shared OpenRouter key;
 *   2. its own key (the chosen provider first, then any other it has a key for);
 *   3. LevelUp's own keys (-289), "Use first" first — not in the tests' legacy mode.
 */
async function resolveWith(get: (x: string) => Promise<string | undefined>, legacy: boolean): Promise<ResolvedAI> {
  const own = await keysFrom(get);
  const chosen = String((await get("aiProvider")) || "").trim();
  const pick = String((await get(OR_MODEL_KEY)) || "").trim() || undefined;
  if (chosen === "openrouter" && own.provider !== "openrouter") {
    // keysFrom tries the chosen provider first, so the workspace has no OpenRouter key of its own.
    const shared = await platformOpenRouterKey();
    if (shared) return { provider: "openrouter", apiKey: shared, model: await sharedOpenRouterModel(pick), configured: true, source: "platform" };
  }
  if (own.apiKey) return { ...own, ...(own.provider === "openrouter" ? { model: pick } : {}), configured: true, source: "workspace" };
  if (legacy) return { ...own, configured: false, source: "none" };
  // -289: LevelUp's own keys (operator-only), for every workspace without one — the
  // operator's workspace included, should it ever clear its own.
  const p = await platformKeys();
  const model = p.provider === "openrouter" ? await sharedOpenRouterModel(undefined) : undefined;
  return { ...p, ...(model ? { model } : {}), configured: !!p.apiKey, source: p.apiKey ? "platform" : "none" };
}

/** Drop the 5-minute cache — aiSettings.set calls this so a new key applies at once. */
export function invalidateWorkspaceAI(): void {
  _cache.clear();
}

/** For tests only. */
export function _resetPlatformAIForTests(): void { _platformReady = false; _cache.clear(); }

/**
 * What a browser-initiated AI request (ai.assist / ai.agent / help.askAI /
 * bookmarks.suggest* / oauthSync.suggestFollowUps) should use. Since -214 the
 * browser never holds the workspace keys, so it sends no apiKey and the server
 * resolves the workspace provider + key here (the client's `provider` is then
 * ignored). An explicit apiKey is still honoured with the provider it came
 * with: a pre-214 bundle still open in a tab during deploy skew sends one, and
 * Settings → AI Features "Test" sends a freshly typed key before it is saved.
 */
export async function resolveRequestAI(input: { provider?: string; apiKey?: string }, user?: any): Promise<{ provider: AIProvider; apiKey?: string; model?: string }> {
  // Audit 3: the daily AI allowance is spent HERE, decided by the key that is actually used. Callers
  // used to charge only when `!input.apiKey` — so apiKey " " (trimmed to nothing below) ran on the
  // platform key for free, and a bogus key fell back to the built-in model unmetered. Now: a key typed
  // in the browser is charged (it can fall back to the built-in model), the PLATFORM key is charged,
  // the workspace's OWN saved key is not (Settings says so).
  const spend = async () => { if (user !== undefined) await (await import("./quota")).spendQuota(user, "ai"); };
  const explicit = String(input.apiKey || "").trim();
  if (explicit) { await spend(); return { provider: (input.provider || "manus") as AIProvider, apiKey: explicit }; }
  const r = await resolveWorkspaceAI();
  if (r.source !== "workspace") await spend();
  return { provider: r.provider, apiKey: r.apiKey, ...(r.model ? { model: r.model } : {}) };
}

/** 'sk-…abcd' — enough to recognise a key, never enough to use it. */
export function maskKey(key: string | null | undefined): string {
  const k = String(key || "").trim();
  if (!k) return "";
  const head = k.startsWith("sk-ant-") ? "sk-ant-" : k.startsWith("sk-or-") ? "sk-or-" : k.startsWith("sk-") ? "sk-" : k.startsWith("AIza") ? "AIza" : "";
  if (k.length < 12) return head + "…";
  return `${head}…${k.slice(-4)}`;
}

export async function callWorkspaceAI(o: { systemPrompt: string; userContent: string; jsonMode?: boolean; maxTokens?: number }): Promise<string> {
  // Audit 3: background AI (coach check-ins and replies, reading delegate replies, digest / weekly /
  // Money summaries) on the PLATFORM key counts against the member's and workspace's daily AI
  // allowance like a request does. Over the allowance → throws, and every caller falls back to its
  // non-AI text. A workspace's own key is not counted.
  const { provider, apiKey, source, model } = await resolveWorkspaceAI();
  const { currentMemberId } = await import("./memberContext");
  const member = currentMemberId();
  if (member && source !== "workspace") {
    const { trySpendQuota } = await import("./quota");
    if (!(await trySpendQuota(member, "ai"))) throw new Error("today's AI allowance for this workspace is used up");
  }
  const r = await callAIProvider({ provider, apiKey, model, systemPrompt: o.systemPrompt, userContent: o.userContent, jsonMode: o.jsonMode, maxTokens: o.maxTokens });
  return r.text;
}
