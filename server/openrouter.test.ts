/**
 * OpenRouter (2026-11-27) — the owner's decisions, tested against the REAL code
 * (server/_core/openRouter.ts, aiProviders.ts, workspaceAI.ts); only storage,
 * the quota counters and the network are stand-ins.
 *
 *   1. key order: the workspace's own OpenRouter key, else LevelUp's shared one;
 *      the shared key never silently becomes everyone's default;
 *   2. the model filter for structured (JSON) answers + the default model;
 *   3. usage metering (shared key counted, own key not; tokens / cost read);
 *   4. OpenRouter's own error messages, retries on 429 / 5xx only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── storage stand-ins ────────────────────────────────────────────────────────
const sys: Record<string, string> = {};                 // system_settings (platform)
const ws: Record<number, Record<string, string>> = {};  // workspace_settings
vi.mock("./db", () => ({
  getSystemSetting: vi.fn(async (k: string) => sys[k]),
  setSystemSetting: vi.fn(async (k: string, v: string) => { sys[k] = v; }),
}));
vi.mock("./_core/workspace", () => ({
  getWorkspaceSetting: vi.fn(async (w: number, k: string) => ws[w]?.[k]),
}));
vi.mock("./_core/mailTrust", () => ({ operatorWorkspaceId: vi.fn(async () => 1) }));
const ctx = { ws: 5 as number | null, member: 42 as number | null };
vi.mock("./_core/memberContext", () => ({
  currentWorkspaceId: vi.fn(async () => ctx.ws),
  currentMemberId: vi.fn(() => ctx.member),
}));
const spent: string[] = [];
vi.mock("./_core/quota", () => ({
  spendQuota: vi.fn(async (u: any, b: string) => { spent.push(`spend:${u?.id}:${b}`); }),
  trySpendQuota: vi.fn(async (m: number, b: string) => { spent.push(`try:${m}:${b}`); return true; }),
}));
// The built-in (Manus) model is off, as in production: a provider error is what the member sees.
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(async () => { throw new Error("built-in model off"); }) }));

// ── network stand-in ─────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  _resetOpenRouterForTests, _setOpenRouterSleepForTests, attributionHeaders, checkOpenRouterKey, listOpenRouterModels,
  modelForCall, OPENROUTER_FALLBACK_MODEL, openRouterChat, openRouterError, perMillion, pickDefaultModel, reasoningPlan,
  structuredMode, structuredModels, supportsStructured, textModels, type OpenRouterModel,
} from "./_core/openRouter";
import { callAIProvider, callAIProviderChat } from "./_core/aiProviders";
import { _resetPlatformAIForTests, callWorkspaceAI, PLATFORM_AI_FLAG, resolveRequestAI, resolveWorkspaceAI } from "./_core/workspaceAI";

const OWN_OR = "sk-or-v1-OWNOWNOWNOWNOWN-1111";
const SHARED_OR = "sk-or-v1-SHAREDSHAREDSHARED-9999";

// Shaped like GET /api/v1/models (fields as OpenRouter sends them).
const m = (id: string, created: number, params: string[], extra: Record<string, unknown> = {}) => ({
  id, name: id.split("/")[1], created, context_length: 200000,
  pricing: { prompt: "0.000003", completion: "0.000015" },
  supported_parameters: params, architecture: { output_modalities: ["text"] },
  top_provider: { max_completion_tokens: 64000 }, ...extra,
});
const STRUCT = ["max_tokens", "response_format", "structured_outputs", "tool_choice", "tools"];
const MODELS = [
  m("anthropic/claude-sonnet-5.5", 300, STRUCT, { reasoning: { mandatory: true, supported_efforts: ["max", "xhigh", "high", "medium", "low"], default_effort: "high" }, pricing: { prompt: "0.000002", completion: "0.00001" } }),
  m("anthropic/claude-sonnet-5.5:batch", 300, STRUCT),
  m("anthropic/claude-sonnet-5", 200, STRUCT),
  m("anthropic/claude-sonnet-9-preview", 400, ["max_tokens", "response_format"]),   // newer, but no tools
  m("anthropic/claude-opus-5.5", 350, STRUCT),
  m("meta-llama/llama-3.1-70b-instruct", 100, ["max_tokens", "tools", "tool_choice"]), // tools only
  m("acme/plain-chat", 150, ["max_tokens", "temperature"]),                         // no structured answers
  m("acme/image-maker", 160, STRUCT, { architecture: { output_modalities: ["image"] } }),
  m("openrouter/auto", 170, STRUCT, { pricing: { prompt: "-1", completion: "-1" } }),
];

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const chatOk = (content: string, extra: Record<string, unknown> = {}) =>
  json(200, { id: "gen-1", model: "anthropic/claude-sonnet-5.5", choices: [{ message: { role: "assistant", content } }], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, cost: 0.00054 }, ...extra });

let chatQueue: Array<Response | Error> = [];
let keyAnswer: Response | Error = json(200, { data: { label: "sk-or-v1-abc…xyz", limit: 25, limit_remaining: 12.5, usage: 12.5, is_free_tier: false } });
let modelsAnswer: () => Response = () => json(200, { data: MODELS });
const chatCalls = () => mockFetch.mock.calls.filter((c) => String(c[0]).endsWith("/chat/completions"));
const lastBody = () => JSON.parse(chatCalls().at(-1)![1].body);
const sleeps: number[] = [];

beforeEach(() => {
  for (const k of Object.keys(sys)) delete sys[k];
  for (const k of Object.keys(ws)) delete (ws as any)[k];
  sys[PLATFORM_AI_FLAG] = JSON.stringify({ at: "2026-11-19T00:00:00Z", savedAt: "2026-11-19T00:00:00Z" }); // -289 copy already done
  ctx.ws = 5; ctx.member = 42;
  spent.length = 0; sleeps.length = 0; chatQueue = [];
  keyAnswer = json(200, { data: { label: "sk-or-v1-abc…xyz", limit: 25, limit_remaining: 12.5, usage: 12.5, is_free_tier: false } });
  modelsAnswer = () => json(200, { data: MODELS });
  _resetOpenRouterForTests();
  _setOpenRouterSleepForTests(async (ms) => { sleeps.push(ms); });
  _resetPlatformAIForTests();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u === "https://openrouter.ai/api/v1/models") return modelsAnswer();
    if (u === "https://openrouter.ai/api/v1/key") { if (keyAnswer instanceof Error) throw keyAnswer; return keyAnswer.clone(); }
    if (u === "https://openrouter.ai/api/v1/chat/completions") {
      const next = chatQueue.shift() ?? chatOk("OK");
      if (next instanceof Error) throw next;
      return next;
    }
    throw new Error(`unexpected fetch ${u}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("1. key order — own OpenRouter key, then LevelUp's shared one", () => {
  it("a workspace that chose OpenRouter uses its OWN key first (with its own model pick)", async () => {
    ws[5] = { aiProvider: "openrouter", aiKey_openrouter: OWN_OR, aiModel_openrouter: "anthropic/claude-opus-5.5" };
    sys.platformAiKey_openrouter = SHARED_OR;
    expect(await resolveWorkspaceAI(5)).toEqual({ provider: "openrouter", apiKey: OWN_OR, model: "anthropic/claude-opus-5.5", configured: true, source: "workspace" });
  });

  it("without its own OpenRouter key it gets LevelUp's shared key — before any other key of its own", async () => {
    ws[5] = { aiProvider: "openrouter", aiKey_openai: "sk-proj-OWNOPENAI-2222", aiModel_openrouter: "anthropic/claude-opus-5.5" };
    sys.platformAiKey_openrouter = SHARED_OR;
    sys.platformAiModel_openrouter = "anthropic/claude-sonnet-5";
    const r = await resolveWorkspaceAI(5);
    expect(r).toMatchObject({ provider: "openrouter", apiKey: SHARED_OR, source: "platform" });
    // the owner pays for the shared key: LevelUp's model, not the workspace's pick…
    expect(r.model).toBe("anthropic/claude-sonnet-5");
  });

  it("…unless the operator lets workspaces use their own model pick on the shared key", async () => {
    ws[5] = { aiProvider: "openrouter", aiModel_openrouter: "anthropic/claude-opus-5.5" };
    sys.platformAiKey_openrouter = SHARED_OR;
    sys.platformAiModel_openrouter = "anthropic/claude-sonnet-5";
    sys.platformAiOpenRouterAnyModel = "1";
    expect((await resolveWorkspaceAI(5)).model).toBe("anthropic/claude-opus-5.5");
  });

  it("no OpenRouter key anywhere → the workspace's other own key, as before", async () => {
    ws[5] = { aiProvider: "openrouter", aiKey_claude: "sk-ant-api03-OWNCLAUDE-3333" };
    expect(await resolveWorkspaceAI(5)).toMatchObject({ provider: "claude", apiKey: "sk-ant-api03-OWNCLAUDE-3333", source: "workspace" });
  });

  it("the shared OpenRouter key never silently becomes the default for workspaces without a key", async () => {
    ws[5] = {};                                   // no choice, no key
    sys.platformAiProvider = "openai";            // today's default: the operator's choice…
    sys.platformAiKey_openrouter = SHARED_OR;     // …even if only the OpenRouter key is saved
    expect(await resolveWorkspaceAI(5)).toEqual({ provider: "manus", configured: false, source: "none" });
    sys.platformAiKey_gemini = "AIzaSyPLATFORMGEMINI-4444";
    _resetPlatformAIForTests();
    expect(await resolveWorkspaceAI(5)).toMatchObject({ provider: "gemini", source: "platform" });
  });

  it("the operator switches the platform default to OpenRouter with 'Use first'", async () => {
    ws[5] = {};
    sys.platformAiProvider = "openrouter";
    sys.platformAiKey_openrouter = SHARED_OR;
    sys.platformAiKey_openai = "sk-proj-PLATFORMOPENAI-5555";
    sys.platformAiModel_openrouter = "anthropic/claude-sonnet-5";
    expect(await resolveWorkspaceAI(5)).toEqual({ provider: "openrouter", apiKey: SHARED_OR, model: "anthropic/claude-sonnet-5", configured: true, source: "platform" });
  });

  it("other workspaces' keys never answer for this one", async () => {
    ws[6] = { aiProvider: "openrouter", aiKey_openrouter: OWN_OR };
    ws[5] = { aiProvider: "openrouter" };
    expect((await resolveWorkspaceAI(5)).apiKey).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. models — the structured-answer filter and the default", () => {
  const list = () => (MODELS as any[]).map((x) => ({ ...x, reasoning: x.reasoning ?? null })) as OpenRouterModel[];

  it("only models whose supported_parameters allow a structured answer are offered for one", () => {
    expect(structuredMode({ supported_parameters: ["response_format"] })).toBe("response_format");
    expect(structuredMode({ supported_parameters: ["structured_outputs"] })).toBe("response_format");
    expect(structuredMode({ supported_parameters: ["tools"] })).toBe("tools");
    expect(structuredMode({ supported_parameters: ["temperature"] })).toBeNull();
    expect(supportsStructured({ supported_parameters: [] })).toBe(false);
    const ids = structuredModels(list()).map((x) => x.id);
    expect(ids).toContain("meta-llama/llama-3.1-70b-instruct");
    expect(ids).not.toContain("acme/plain-chat");
    expect(ids).not.toContain("acme/image-maker");                 // not a text model
    expect(ids).not.toContain("anthropic/claude-sonnet-5.5:batch"); // batch jobs, not answers on screen
  });

  it("the default is the newest Claude Sonnet that supports tools, read from the list", () => {
    expect(pickDefaultModel(list())).toBe("anthropic/claude-sonnet-5.5"); // not the newer preview without tools, not :batch, not Opus
    expect(pickDefaultModel([])).toBe(OPENROUTER_FALLBACK_MODEL);
  });

  it("a JSON call never runs on a model that can't give one", () => {
    expect(modelForCall("acme/plain-chat", list(), false)).toMatchObject({ model: "acme/plain-chat", replaced: false });
    expect(modelForCall("acme/plain-chat", list(), true)).toMatchObject({ model: "anthropic/claude-sonnet-5.5", replaced: true });
    expect(modelForCall("meta-llama/llama-3.1-70b-instruct", list(), true).model).toBe("meta-llama/llama-3.1-70b-instruct");
    expect(modelForCall("vendor/retired-model", list(), false)).toMatchObject({ model: "anthropic/claude-sonnet-5.5", replaced: true });
    expect(modelForCall(undefined, list(), false).model).toBe("anthropic/claude-sonnet-5.5");
    // list unavailable: a JSON call can't check the pick, so it uses the known-good fallback
    expect(modelForCall("acme/plain-chat", [], true).model).toBe(OPENROUTER_FALLBACK_MODEL);
    expect(modelForCall("acme/plain-chat", [], false).model).toBe("acme/plain-chat");
  });

  it("jsonMode sends response_format, or one tool for tools-only models, and swaps an unfit pick", async () => {
    chatQueue = [chatOk('{"tags":["a"]}'), json(200, { model: "meta-llama/llama-3.1-70b-instruct", choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "answer", arguments: '{"tags":["b"]}' } }] } }] }), chatOk('{"tags":["c"]}')];
    expect((await openRouterChat({ apiKey: OWN_OR, model: "anthropic/claude-sonnet-5", system: "s", messages: [{ role: "user", content: "u" }], jsonMode: true })).text).toBe('{"tags":["a"]}');
    expect(lastBody()).toMatchObject({ model: "anthropic/claude-sonnet-5", response_format: { type: "json_object" } });
    expect(lastBody().messages[0].content).toMatch(/ONLY one valid JSON object/);

    expect((await openRouterChat({ apiKey: OWN_OR, model: "meta-llama/llama-3.1-70b-instruct", system: "s", messages: [{ role: "user", content: "u" }], jsonMode: true })).text).toBe('{"tags":["b"]}');
    expect(lastBody().tools[0].function.name).toBe("answer");
    expect(lastBody().response_format).toBeUndefined();

    await openRouterChat({ apiKey: OWN_OR, model: "acme/plain-chat", system: "s", messages: [{ role: "user", content: "u" }], jsonMode: true });
    expect(lastBody().model).toBe("anthropic/claude-sonnet-5.5");
  });

  it("the list is fetched without a key, cached, and kept when a refresh fails", async () => {
    await listOpenRouterModels();
    await listOpenRouterModels();
    const calls = mockFetch.mock.calls.filter((c) => String(c[0]).endsWith("/models"));
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0][1] ?? {})).not.toMatch(/Authorization|Bearer/i);
    modelsAnswer = () => json(503, { error: { code: 503, message: "down" } });
    expect((await listOpenRouterModels({ force: true })).length).toBe(MODELS.length);
  });

  it("prices per million tokens; routers' -1 means it varies", () => {
    expect(perMillion("0.000002")).toBe(2);
    expect(perMillion("0.00000005")).toBe(0.05);
    expect(perMillion("-1")).toBeNull();
    expect(textModels(list()).some((x) => x.id === "acme/image-maker")).toBe(false);
  });

  it("a thinking model keeps room for the answer (lowest effort, limit raised)", () => {
    const sonnet = list()[0];
    expect(reasoningPlan(sonnet, 1024)).toEqual({ reasoning: { effort: "low", exclude: true }, maxTokens: 2112 });
    const optional = { ...sonnet, reasoning: { mandatory: false, default_enabled: true, supported_efforts: ["high", "low", "none"] } };
    expect(reasoningPlan(optional, 1024)).toEqual({ reasoning: { effort: "none" }, maxTokens: 1024 });
    expect(reasoningPlan(list()[2], 1024)).toEqual({ maxTokens: 1024 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. usage metering", () => {
  it("the shared key is counted against the daily AI allowance; the workspace's own key is not", async () => {
    ws[5] = { aiProvider: "openrouter" };
    sys.platformAiKey_openrouter = SHARED_OR;
    expect(await resolveRequestAI({}, { id: 7 })).toMatchObject({ provider: "openrouter", apiKey: SHARED_OR });
    expect(spent).toEqual(["spend:7:ai"]);

    spent.length = 0; _resetPlatformAIForTests();
    ws[5].aiKey_openrouter = OWN_OR;
    expect(await resolveRequestAI({}, { id: 7 })).toMatchObject({ provider: "openrouter", apiKey: OWN_OR });
    expect(spent).toEqual([]);
  });

  it("background AI (coach, digests) on the shared key spends the member's allowance and uses LevelUp's model", async () => {
    ws[5] = { aiProvider: "openrouter" };
    sys.platformAiKey_openrouter = SHARED_OR;
    sys.platformAiModel_openrouter = "anthropic/claude-sonnet-5";
    chatQueue = [chatOk('{"summary":"ok"}')];
    expect(await callWorkspaceAI({ systemPrompt: "s", userContent: "u", jsonMode: true })).toBe('{"summary":"ok"}');
    expect(spent).toEqual(["try:42:ai"]);
    expect(lastBody().model).toBe("anthropic/claude-sonnet-5");
    expect(chatCalls()[0][1].headers.Authorization).toBe(`Bearer ${SHARED_OR}`);
  });

  it("the tokens and cost OpenRouter reports come back with the answer", async () => {
    const r = await callAIProvider({ provider: "openrouter", apiKey: OWN_OR, systemPrompt: "s", userContent: "u" });
    expect(r).toMatchObject({ text: "OK", providerUsed: "openrouter", model: "anthropic/claude-sonnet-5.5", usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150, cost: 0.00054 } });
    const c = await callAIProviderChat({ provider: "openrouter", apiKey: OWN_OR, system: "s", messages: [{ role: "assistant", content: "hi" }, { role: "user", content: "u" }] });
    expect(c.usage?.totalTokens).toBe(150);
    expect(lastBody().messages.map((x: any) => x.role)).toEqual(["system", "user"]); // leading assistant turn dropped
  });

  it("sends LevelUp's URL and name — never anything about the member", async () => {
    await openRouterChat({ apiKey: OWN_OR, system: "s", messages: [{ role: "user", content: "u" }] });
    const h = chatCalls()[0][1].headers;
    expect(h["HTTP-Referer"]).toBe("https://levelupnow.tools");
    expect(h["X-Title"]).toBe("LevelUp");
    expect(Object.keys(attributionHeaders()).sort()).toEqual(["HTTP-Referer", "X-OpenRouter-Title", "X-Title"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. errors — OpenRouter's own message, retries only where they help", () => {
  const err = (status: number, message: string, metadata?: Record<string, unknown>, headers?: Record<string, string>) =>
    json(status, { error: { code: status, message, ...(metadata ? { metadata } : {}) } }, headers);

  it("each status reads as what it means, with OpenRouter's words", () => {
    expect(openRouterError(401, JSON.stringify({ error: { code: 401, message: "No auth credentials found" } })).message)
      .toBe("OpenRouter error 401 — the key is wrong or has been revoked: No auth credentials found");
    expect(openRouterError(402, JSON.stringify({ error: { code: 402, message: "Insufficient credits" } })).message)
      .toBe("OpenRouter error 402 — this key is out of credit: Insufficient credits");
    expect(openRouterError(429, "{}").message).toBe("OpenRouter error 429 — rate limited, try again in a moment");
    expect(openRouterError(503, "<html>bad gateway</html>").message).toMatch(/^OpenRouter error 503 — OpenRouter or the model's provider is unavailable right now: <html>bad gateway<\/html>$/);
    expect(openRouterError(401, "").retryable).toBe(false);
    expect(openRouterError(502, "").retryable).toBe(true);
    expect(openRouterError(402, JSON.stringify({ error: { code: 402, message: "busy", metadata: { limit_source: "openrouter_in_flight_budget" } } })).retryable).toBe(true);
  });

  it("401 and 402 are not retried, and the key is never in the message", async () => {
    chatQueue = [err(401, "User not found.")];
    const e1 = await openRouterChat({ apiKey: OWN_OR, system: "s", messages: [{ role: "user", content: "u" }] }).catch((e) => e);
    expect(e1.message).toBe("OpenRouter error 401 — the key is wrong or has been revoked: User not found.");
    expect(e1.message).not.toContain(OWN_OR);
    expect(chatCalls()).toHaveLength(1);

    chatQueue = [err(402, "This request requires more credits")];
    await expect(openRouterChat({ apiKey: OWN_OR, system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toThrow(/402 — this key is out of credit: This request requires more credits/);
    expect(chatCalls()).toHaveLength(2);
    expect(sleeps).toEqual([]);
  });

  it("429 and 5xx are retried with backoff (Retry-After honoured), then succeed", async () => {
    chatQueue = [err(429, "Rate limit exceeded", undefined, { "retry-after": "3" }), err(502, "Provider returned error"), chatOk("finally")];
    expect((await openRouterChat({ apiKey: OWN_OR, system: "s", messages: [{ role: "user", content: "u" }] })).text).toBe("finally");
    expect(chatCalls()).toHaveLength(3);
    expect(sleeps).toEqual([3000, 2000]);
  });

  it("still rate limited after the retries → OpenRouter's rate-limit message", async () => {
    chatQueue = [err(429, "Rate limit exceeded"), err(429, "Rate limit exceeded"), err(429, "Rate limit exceeded")];
    await expect(openRouterChat({ apiKey: OWN_OR, system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toThrow("OpenRouter error 429 — rate limited, try again in a moment: Rate limit exceeded");
    expect(chatCalls()).toHaveLength(3);
  });

  it("an error inside a 200 answer is an error too", async () => {
    chatQueue = [json(200, { error: { code: 400, message: "Context length exceeded" } })];
    await expect(openRouterChat({ apiKey: OWN_OR, system: "s", messages: [{ role: "user", content: "u" }] })).rejects.toThrow("OpenRouter error 400: Context length exceeded");
  });

  it("the member sees OpenRouter's message when the built-in model can't stand in", async () => {
    chatQueue = [err(402, "Insufficient credits")];
    await expect(callAIProvider({ provider: "openrouter", apiKey: SHARED_OR, systemPrompt: "s", userContent: "u" })).rejects.toThrow(/402 — this key is out of credit: Insufficient credits/);
  });

  it("checking a key: valid with the credit left, or OpenRouter's refusal", async () => {
    expect(await checkOpenRouterKey(OWN_OR)).toEqual({ valid: true, label: "sk-or-v1-abc…xyz", limit: 25, limitRemaining: 12.5, usage: 12.5, isFreeTier: false });
    const call = mockFetch.mock.calls.find((c) => String(c[0]).endsWith("/key"))!;
    expect(call[1].headers.Authorization).toBe(`Bearer ${OWN_OR}`);
    keyAnswer = err(401, "User not found.");
    await expect(checkOpenRouterKey("sk-or-v1-bad")).rejects.toMatchObject({ status: 401, message: "OpenRouter error 401 — the key is wrong or has been revoked: User not found." });
  });
});
