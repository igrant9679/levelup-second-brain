/**
 * OpenRouter — one key, many models (owner decision 2026-11-27, shared by all four apps).
 *
 * OpenRouter takes OpenAI's request shape at https://openrouter.ai/api/v1
 * (POST /chat/completions, Authorization: Bearer <key>). This module is the only
 * place that talks to it:
 *   - listOpenRouterModels()   GET /models (no key needed), cached for 6 hours;
 *   - pickDefaultModel()       the newest Claude Sonnet in that list that supports tools;
 *   - modelForCall()           which model a call may use — a call that needs a JSON
 *                              answer only uses a model whose supported_parameters
 *                              allow it (response_format / structured_outputs / tools);
 *   - openRouterChat()         one chat call, with retries on 408 / 429 / 5xx;
 *   - checkOpenRouterKey()     GET /key — valid or not, and the credit left on it;
 *   - openRouterError()        OpenRouter's own message, with what it means for the member.
 *
 * Keys never appear in an error, a log line or a return value. The attribution
 * headers carry LevelUp's public URL and name only — never anything about a member.
 */
import { appOrigin } from "./appOrigin";

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Used only when the live model list cannot be fetched. Read from the live list
 * (GET /api/v1/models) on 2026-11-27: the newest anthropic/claude-sonnet… id that
 * lists `tools`. Whenever the list loads, pickDefaultModel() decides instead.
 */
export const OPENROUTER_FALLBACK_MODEL = "anthropic/claude-sonnet-5.5";

const MODELS_TTL_MS = 6 * 3_600_000;
const CALL_TIMEOUT_MS = 120_000;
const KEY_TIMEOUT_MS = 15_000;
/** Attempts per call: the first plus two retries (429 / 5xx / timeouts / network). */
export const OPENROUTER_ATTEMPTS = 3;

export type OpenRouterModel = {
  id: string;
  name: string;
  created: number;
  context_length: number | null;
  pricing: { prompt?: string; completion?: string };
  supported_parameters: string[];
  architecture?: { output_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number | null };
  reasoning?: { mandatory?: boolean; default_enabled?: boolean; supported_efforts?: string[] } | null;
};

/** The slice of a model the Settings picker needs (prices per million tokens, USD). */
export type OpenRouterModelInfo = {
  id: string;
  name: string;
  context: number | null;
  promptPerM: number | null;
  completionPerM: number | null;
  structured: boolean;
  tools: boolean;
};

// ── the model list ───────────────────────────────────────────────────────────

let _models: { at: number; list: OpenRouterModel[] } | null = null;
let _inflight: Promise<OpenRouterModel[]> | null = null;

/** For tests only. */
export function _resetOpenRouterForTests(): void {
  _models = null;
  _inflight = null;
  _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
}

let _sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
/** For tests only: replace the wait between retries. */
export function _setOpenRouterSleepForTests(fn: (ms: number) => Promise<void>): void {
  _sleep = fn;
}

function cleanModel(m: any): OpenRouterModel | null {
  if (!m || typeof m.id !== "string" || !m.id.includes("/")) return null;
  return {
    id: m.id,
    name: typeof m.name === "string" && m.name ? m.name : m.id,
    created: Number(m.created) || 0,
    context_length: Number.isFinite(Number(m.context_length)) ? Number(m.context_length) : null,
    pricing: { prompt: m.pricing?.prompt, completion: m.pricing?.completion },
    supported_parameters: Array.isArray(m.supported_parameters) ? m.supported_parameters.map(String) : [],
    architecture: { output_modalities: Array.isArray(m.architecture?.output_modalities) ? m.architecture.output_modalities.map(String) : undefined },
    top_provider: { max_completion_tokens: Number(m.top_provider?.max_completion_tokens) || null },
    reasoning: m.reasoning && typeof m.reasoning === "object" ? {
      mandatory: !!m.reasoning.mandatory,
      default_enabled: m.reasoning.default_enabled,
      supported_efforts: Array.isArray(m.reasoning.supported_efforts) ? m.reasoning.supported_efforts.map(String) : undefined,
    } : null,
  };
}

/**
 * Models that can answer LevelUp's text AI: text output, and not a `:batch`
 * variant (those are for asynchronous batch jobs, not an answer on screen).
 */
export function textModels(list: OpenRouterModel[]): OpenRouterModel[] {
  return list.filter((m) => {
    if (/:batch$/i.test(m.id)) return false;
    const out = m.architecture?.output_modalities;
    return !out || out.includes("text");
  });
}

/**
 * OpenRouter's model list, cached for 6 hours. No key is sent (the endpoint needs
 * none). On a failure the last good list is kept; with none, [] — callers then
 * fall back to OPENROUTER_FALLBACK_MODEL.
 */
export async function listOpenRouterModels(opts: { force?: boolean } = {}): Promise<OpenRouterModel[]> {
  if (!opts.force && _models && Date.now() - _models.at < MODELS_TTL_MS) return _models.list;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const resp = await fetch(`${OPENROUTER_BASE}/models`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(KEY_TIMEOUT_MS) });
      if (!resp.ok) throw new Error(`models ${resp.status}`);
      const data: any = await resp.json();
      const list = (Array.isArray(data?.data) ? data.data : []).map(cleanModel).filter(Boolean) as OpenRouterModel[];
      if (!list.length) throw new Error("empty model list");
      _models = { at: Date.now(), list };
      return list;
    } catch (e) {
      console.warn(`[ai] OpenRouter model list unavailable: ${e instanceof Error ? e.message : String(e)}`);
      return _models?.list ?? [];
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

// ── capabilities and the default ─────────────────────────────────────────────

/** How a model can give a JSON answer: response_format, a tool call, or not at all. */
export function structuredMode(m: Pick<OpenRouterModel, "supported_parameters"> | null | undefined): "response_format" | "tools" | null {
  const p = m?.supported_parameters ?? [];
  if (p.includes("response_format") || p.includes("structured_outputs")) return "response_format";
  if (p.includes("tools")) return "tools";
  return null;
}

/** May a feature that needs a structured (JSON) answer offer this model? */
export function supportsStructured(m: Pick<OpenRouterModel, "supported_parameters"> | null | undefined): boolean {
  return structuredMode(m) !== null;
}

/** The models a structured-answer feature may offer. */
export function structuredModels(list: OpenRouterModel[]): OpenRouterModel[] {
  return textModels(list).filter(supportsStructured);
}

/** The newest Claude Sonnet in the list that supports tools (read from the list, never guessed). */
export function pickDefaultModel(list: OpenRouterModel[]): string {
  const sonnets = textModels(list)
    .filter((m) => /^anthropic\/claude-sonnet/i.test(m.id) && !m.id.includes(":") && m.supported_parameters.includes("tools"))
    .sort((a, b) => b.created - a.created);
  return sonnets[0]?.id ?? OPENROUTER_FALLBACK_MODEL;
}

/** USD per million tokens from OpenRouter's per-token price; null when it varies (routers report -1). */
export function perMillion(v: string | undefined): number | null {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1e6 * 1000) / 1000;
}

export function modelInfo(m: OpenRouterModel): OpenRouterModelInfo {
  return {
    id: m.id,
    name: m.name,
    context: m.context_length,
    promptPerM: perMillion(m.pricing.prompt),
    completionPerM: perMillion(m.pricing.completion),
    structured: supportsStructured(m),
    tools: m.supported_parameters.includes("tools"),
  };
}

/** A model id as OpenRouter writes them ("vendor/model[:variant]"); anything else is refused on save. */
export function isModelId(v: string): boolean {
  return /^[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._:~-]*$/i.test(v) && v.length <= 200;
}

/**
 * The model a call uses. The chosen one, unless:
 *   - nothing is chosen, or it is no longer in OpenRouter's list → the default;
 *   - the call needs a JSON answer and the chosen model cannot give one → the default
 *     (when the list could not be loaded at all, OPENROUTER_FALLBACK_MODEL — a model
 *     known to support it — because the chosen one cannot be checked).
 */
export function modelForCall(chosen: string | undefined | null, list: OpenRouterModel[], needsStructured: boolean): { model: string; info: OpenRouterModel | null; replaced: boolean } {
  const usable = textModels(list);
  const byId = new Map(usable.map((m) => [m.id, m] as const));
  const want = String(chosen || "").trim();
  if (!usable.length) {
    const model = want && !needsStructured ? want : OPENROUTER_FALLBACK_MODEL;
    return { model, info: null, replaced: !!want && model !== want };
  }
  const def = pickDefaultModel(usable);
  const hit = want ? byId.get(want) : undefined;
  if (hit && (!needsStructured || supportsStructured(hit))) return { model: hit.id, info: hit, replaced: false };
  return { model: def, info: byId.get(def) ?? null, replaced: !!want };
}

// ── reasoning budget ─────────────────────────────────────────────────────────

const EFFORT_RANK = ["minimal", "low", "medium", "high", "xhigh", "max"];
const EFFORT_SHARE: Record<string, number> = { minimal: 0.1, low: 0.2, medium: 0.5, high: 0.8, xhigh: 0.95, max: 0.95 };

/**
 * Many models think before they answer, and on OpenRouter that thinking comes out
 * of the same max_tokens (Anthropic: at least 1,024 tokens, and the limit must be
 * above it). LevelUp's calls ask for short answers (256–4,000 tokens), so left
 * alone a thinking model can spend the whole budget and return nothing. So:
 * reasoning off where the model allows it, else the lowest effort it offers, with
 * the limit raised so the answer still gets the tokens the caller asked for.
 */
export function reasoningPlan(m: OpenRouterModel | null, answerTokens: number): { reasoning?: Record<string, unknown>; maxTokens: number } {
  const r = m?.reasoning;
  const thinks = !!r && (r.mandatory || r.default_enabled === true);
  if (!m || !thinks) return { maxTokens: answerTokens };
  const efforts = r!.supported_efforts ?? [];
  if (!r!.mandatory && efforts.includes("none")) return { reasoning: { effort: "none" }, maxTokens: answerTokens };
  const effort = EFFORT_RANK.find((e) => efforts.includes(e)) ?? "low";
  const share = EFFORT_SHARE[effort] ?? 0.2;
  let maxTokens = Math.ceil(Math.max(answerTokens + 1024, answerTokens / (1 - Math.min(share, 0.9)))) + 64;
  const cap = m.top_provider?.max_completion_tokens;
  if (cap && cap > answerTokens && maxTokens > cap) maxTokens = cap;
  return { reasoning: { effort, exclude: true }, maxTokens };
}

// ── errors ───────────────────────────────────────────────────────────────────

/** OpenRouter's own error message out of a response body ({error:{code,message,metadata}}). */
function bodyMessage(body: string): { message: string; metadata: Record<string, unknown> } {
  try {
    const j = JSON.parse(body);
    const msg = j?.error?.message ?? j?.message;
    return { message: typeof msg === "string" && msg.trim() ? msg.trim() : "", metadata: (j?.error?.metadata && typeof j.error.metadata === "object") ? j.error.metadata : {} };
  } catch {
    return { message: body.replace(/\s+/g, " ").trim().slice(0, 200), metadata: {} };
  }
}

export class OpenRouterError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(status: number, message: string, retryable: boolean) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * The error a member sees: OpenRouter's own message, plus what it means.
 *   401 → the key is wrong or revoked; 402 → out of credit on that key;
 *   429 → rate limited (retried first); 5xx → OpenRouter or the model's provider is down.
 */
export function openRouterError(status: number, body: string): OpenRouterError {
  const { message, metadata } = bodyMessage(body || "");
  const said = message ? `: ${message.slice(0, 300)}` : "";
  const inFlight = metadata?.limit_source === "openrouter_in_flight_budget";
  if (status === 401) return new OpenRouterError(401, `OpenRouter error 401 — the key is wrong or has been revoked${said}`, false);
  if (status === 402) return new OpenRouterError(402, `OpenRouter error 402 — this key is out of credit${said}`, inFlight);
  if (status === 403) return new OpenRouterError(403, `OpenRouter error 403 — this key may not use that model, or the request was blocked${said}`, false);
  if (status === 408) return new OpenRouterError(408, `OpenRouter error 408 — the request timed out${said}`, true);
  if (status === 429) return new OpenRouterError(429, `OpenRouter error 429 — rate limited, try again in a moment${said}`, true);
  if (status >= 500) return new OpenRouterError(status, `OpenRouter error ${status} — OpenRouter or the model's provider is unavailable right now${said}`, true);
  return new OpenRouterError(status, `OpenRouter error ${status}${said}`, false);
}

function retryDelay(resp: Response | null, attempt: number): number {
  const ra = resp?.headers?.get?.("retry-after");
  const secs = ra != null && ra !== "" ? Number(ra) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 10) * 1000;
  return 1000 * 2 ** (attempt - 1); // 1 s, then 2 s
}

/** Attribution: LevelUp's public URL and name. Nothing about the member, ever. */
export function attributionHeaders(): Record<string, string> {
  return { "HTTP-Referer": appOrigin(), "X-Title": "LevelUp", "X-OpenRouter-Title": "LevelUp" };
}

// ── one chat call ────────────────────────────────────────────────────────────

export type OpenRouterUsage = { promptTokens: number; completionTokens: number; totalTokens: number; cost: number | null };

export interface OpenRouterChatOptions {
  apiKey: string;
  /** The workspace's chosen model (or none → the default). */
  model?: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  jsonMode?: boolean;
  maxTokens?: number;
}

const JSON_ONLY = "\n\nRespond with ONLY one valid JSON object. No prose before or after it, no markdown fences.";
const ANSWER_TOOL = "answer";

function parseUsage(u: any): OpenRouterUsage | null {
  if (!u || typeof u !== "object") return null;
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { promptTokens: n(u.prompt_tokens), completionTokens: n(u.completion_tokens), totalTokens: n(u.total_tokens), cost: Number.isFinite(Number(u.cost)) ? Number(u.cost) : null };
}

/**
 * One OpenRouter chat call. Retries 408 / 429 / 5xx (and network failures) up to
 * OPENROUTER_ATTEMPTS times, honouring Retry-After (at most 10 s); anything else
 * throws openRouterError at once. For a JSON answer the model gets
 * response_format json_object when it lists it, otherwise one tool to answer
 * through; a model that offers neither is never used for it (modelForCall).
 */
export async function openRouterChat(o: OpenRouterChatOptions): Promise<{ text: string; model: string; usage: OpenRouterUsage | null }> {
  const list = await listOpenRouterModels();
  const pick = modelForCall(o.model, list, !!o.jsonMode);
  const mode = o.jsonMode ? (pick.info ? structuredMode(pick.info) : "response_format") : null;
  const plan = reasoningPlan(pick.info, o.maxTokens ?? 1024);
  const body: Record<string, unknown> = {
    model: pick.model,
    messages: [{ role: "system", content: o.jsonMode ? o.system + JSON_ONLY : o.system }, ...o.messages],
    max_tokens: plan.maxTokens,
    ...(plan.reasoning ? { reasoning: plan.reasoning } : {}),
  };
  if (mode === "response_format") body.response_format = { type: "json_object" };
  if (mode === "tools") {
    // tool_choice stays "auto": a forced tool is refused by models that are thinking.
    body.tools = [{ type: "function", function: { name: ANSWER_TOOL, description: "Give the answer as one JSON object.", parameters: { type: "object", additionalProperties: true } } }];
    body.tool_choice = "auto";
  }
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= OPENROUTER_ATTEMPTS; attempt++) {
    let resp: Response | null = null;
    try {
      resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}`, ...attributionHeaders() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (e) {
      // network failure or our timeout: transient
      lastErr = new OpenRouterError(0, `OpenRouter could not be reached: ${e instanceof Error ? e.message : String(e)}`, true);
      if (attempt < OPENROUTER_ATTEMPTS) { await _sleep(retryDelay(null, attempt)); continue; }
      throw lastErr;
    }
    if (!resp.ok) {
      const err = openRouterError(resp.status, await resp.text().catch(() => ""));
      lastErr = err;
      if (err.retryable && attempt < OPENROUTER_ATTEMPTS) { await _sleep(retryDelay(resp, attempt)); continue; }
      throw err;
    }
    const data: any = await resp.json();
    // An error during generation can come back inside a 200.
    if (data?.error) {
      const code = Number(data.error.code) || 502;
      const err = openRouterError(code, JSON.stringify({ error: data.error }));
      lastErr = err;
      if (err.retryable && attempt < OPENROUTER_ATTEMPTS) { await _sleep(retryDelay(null, attempt)); continue; }
      throw err;
    }
    const msg = data?.choices?.[0]?.message ?? {};
    let text = typeof msg.content === "string" ? msg.content : Array.isArray(msg.content) ? msg.content.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("") : "";
    const call = Array.isArray(msg.tool_calls) ? msg.tool_calls.find((c: any) => c?.function?.name === ANSWER_TOOL) : null;
    if (call && typeof call.function.arguments === "string" && call.function.arguments.trim()) text = call.function.arguments;
    return { text: text ?? "", model: typeof data?.model === "string" ? data.model : pick.model, usage: parseUsage(data?.usage) };
  }
  throw lastErr instanceof Error ? lastErr : new Error("OpenRouter did not answer");
}

// ── checking a key ───────────────────────────────────────────────────────────

export type OpenRouterKeyCheck = { valid: true; label: string | null; limit: number | null; limitRemaining: number | null; usage: number | null; isFreeTier: boolean };

/**
 * GET /api/v1/key — whether OpenRouter accepts the key, and the credit left on it
 * (`limit_remaining`, null when the key has no limit). Throws openRouterError on a
 * refusal (401 = wrong or revoked key). Returns no part of the key.
 */
export async function checkOpenRouterKey(apiKey: string): Promise<OpenRouterKeyCheck> {
  let resp: Response;
  try {
    resp = await fetch(`${OPENROUTER_BASE}/key`, { headers: { Authorization: `Bearer ${apiKey}`, ...attributionHeaders() }, signal: AbortSignal.timeout(KEY_TIMEOUT_MS) });
  } catch (e) {
    throw new OpenRouterError(0, `OpenRouter could not be reached to check the key: ${e instanceof Error ? e.message : String(e)}`, true);
  }
  if (!resp.ok) throw openRouterError(resp.status, await resp.text().catch(() => ""));
  const data: any = await resp.json().catch(() => ({}));
  const d = data?.data ?? {};
  const num = (v: any) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return { valid: true, label: typeof d.label === "string" ? d.label.slice(0, 80) : null, limit: num(d.limit), limitRemaining: num(d.limit_remaining), usage: num(d.usage), isFreeTier: !!d.is_free_tier };
}
