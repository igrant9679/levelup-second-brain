/**
 * OpenRouter in Settings → AI Features and the AI endpoints, through the REAL
 * routers (aiSettings, ai, bookmarks) — storage and the network are stand-ins.
 *   - a new OpenRouter key is checked with GET /api/v1/key before it is saved:
 *     refused → not saved, OpenRouter's message shown; valid → the credit left;
 *   - keys never come back to the browser; the model pick is validated;
 *   - the model picker's list, with the structured-answer filter;
 *   - ai.assist / ai.agent / bookmarks run on OpenRouter and show its errors;
 *   - LevelUp's shared OpenRouter key (Platform console) is operator-only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const settings: Record<string, string> = {};
vi.mock("./db", () => ({
  getSystemSetting: vi.fn(async (k: string) => settings[k]),
  setSystemSetting: vi.fn(async (k: string, v: string) => { settings[k] = v; }),
}));
vi.mock("./routers/appData", () => ({ isOwnerCtxUser: vi.fn(async (u: { id: number }) => u.id === 1) }));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(async () => { throw new Error("built-in model off"); }) }));
vi.mock("./_core/quota", () => ({ spendQuota: vi.fn(async () => {}), trySpendQuota: vi.fn(async () => true) }));
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { aiSettingsRouter } from "./routers/aiSettings";
import { aiRouter } from "./routers/ai";
import { _resetOpenRouterForTests, _setOpenRouterSleepForTests } from "./_core/openRouter";
import { _resetPlatformAIForTests } from "./_core/workspaceAI";

const OWNER = { user: { id: 1, role: "admin" } } as any;
const MEMBER = { user: { id: 8, role: "user" } } as any;
const KEY = "sk-or-v1-SECRETSECRETSECRET-abcd";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5", created: 300, context_length: 1000000, pricing: { prompt: "0.000002", completion: "0.00001" }, supported_parameters: ["tools", "response_format", "structured_outputs"], architecture: { output_modalities: ["text"] } },
  { id: "acme/plain-chat", name: "Acme: Plain Chat", created: 100, context_length: 8000, pricing: { prompt: "0.0000001", completion: "0.0000002" }, supported_parameters: ["temperature"], architecture: { output_modalities: ["text"] } },
];
let keyAnswer: () => Response;
let chat: Response[];

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k];
  _resetOpenRouterForTests();
  _setOpenRouterSleepForTests(async () => {});
  _resetPlatformAIForTests();
  keyAnswer = () => json(200, { data: { label: "sk-or-v1-SEC…abcd", limit: 10, limit_remaining: 7.25, usage: 2.75 } });
  chat = [];
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/api/v1/models")) return json(200, { data: MODELS });
    if (u.endsWith("/api/v1/key")) return keyAnswer();
    if (u.endsWith("/api/v1/chat/completions")) return chat.shift() ?? json(200, { model: "anthropic/claude-sonnet-5.5", choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } });
    throw new Error(`unexpected fetch ${u}`);
  });
});

describe("saving an OpenRouter key", () => {
  it("a key OpenRouter refuses is NOT saved, and its own message is shown", async () => {
    keyAnswer = () => json(401, { error: { code: 401, message: "User not found." } });
    await expect(aiSettingsRouter.createCaller(OWNER).set({ openrouter: "sk-or-v1-wrong" }))
      .rejects.toThrow("OpenRouter error 401 — the key is wrong or has been revoked: User not found. The key was not saved.");
    expect(settings.aiKey_openrouter).toBeUndefined();
  });

  it("a good key is saved and comes back as valid with the credit left — never the key or its label", async () => {
    const res = await aiSettingsRouter.createCaller(OWNER).set({ openrouter: `  ${KEY} `, provider: "openrouter" });
    expect(res).toEqual({ success: true, openrouter: { checked: true, valid: true, limit: 10, limitRemaining: 7.25, usage: 2.75 } });
    expect(settings.aiKey_openrouter).toBe(KEY);
    expect(settings.aiProvider).toBe("openrouter");
    const got = await aiSettingsRouter.createCaller(MEMBER).get();
    expect(JSON.stringify(got)).not.toContain("SECRET");
    expect(got.keys.openrouter).toEqual({ configured: true, hint: "sk-or-…abcd" });
    expect(got.openrouter).toMatchObject({ model: "", sharedKey: false });
  });

  it("OpenRouter unreachable → saved, and the answer says it couldn't be checked", async () => {
    keyAnswer = () => { throw new TypeError("fetch failed"); };
    const res: any = await aiSettingsRouter.createCaller(OWNER).set({ openrouter: KEY });
    expect(res.openrouter).toMatchObject({ checked: false });
    expect(res.openrouter.error).toMatch(/could not be reached/);
    expect(settings.aiKey_openrouter).toBe(KEY);
  });

  it("members can't change it; clearing doesn't call OpenRouter", async () => {
    await expect(aiSettingsRouter.createCaller(MEMBER).set({ openrouter: KEY })).rejects.toThrow(/owner or an admin/i);
    settings.aiKey_openrouter = KEY;
    await aiSettingsRouter.createCaller(OWNER).set({ openrouter: "" });
    expect(settings.aiKey_openrouter).toBe("");
    expect(mockFetch.mock.calls.some((c) => String(c[0]).endsWith("/key"))).toBe(false);
  });

  it("the model pick is an OpenRouter model id or nothing", async () => {
    await aiSettingsRouter.createCaller(OWNER).set({ openrouterModel: "anthropic/claude-sonnet-5.5" });
    expect(settings.aiModel_openrouter).toBe("anthropic/claude-sonnet-5.5");
    await expect(aiSettingsRouter.createCaller(OWNER).set({ openrouterModel: "<script>" })).rejects.toThrow(/not an OpenRouter model id/);
    await aiSettingsRouter.createCaller(OWNER).set({ openrouterModel: "" });
    expect(settings.aiModel_openrouter).toBe("");
  });
});

describe("the model picker", () => {
  it("lists OpenRouter's models with prices per million and the structured filter", async () => {
    const all = await aiSettingsRouter.createCaller(MEMBER).openRouterModels();
    expect(all.available).toBe(true);
    expect(all.defaultModel).toBe("anthropic/claude-sonnet-5.5");
    expect(all.models).toEqual([
      { id: "acme/plain-chat", name: "Acme: Plain Chat", context: 8000, promptPerM: 0.1, completionPerM: 0.2, structured: false, tools: false },
      { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5", context: 1000000, promptPerM: 2, completionPerM: 10, structured: true, tools: true },
    ]);
    const only = await aiSettingsRouter.createCaller(MEMBER).openRouterModels({ structuredOnly: true });
    expect(only.models.map((x) => x.id)).toEqual(["anthropic/claude-sonnet-5.5"]);
  });
});

describe("the AI endpoints on OpenRouter", () => {
  beforeEach(() => {
    settings.aiProvider = "openrouter";
    settings.aiKey_openrouter = KEY;
    settings.aiModel_openrouter = "acme/plain-chat";
  });

  it("ai.assist uses the workspace's key and model", async () => {
    const res = await aiRouter.createCaller(MEMBER).assist({ systemPrompt: "s", userContent: "u" });
    expect(res).toEqual({ result: "OK", provider: "openrouter" });
    const call = mockFetch.mock.calls.find((c) => String(c[0]).endsWith("/chat/completions"))!;
    expect(call[1].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(call[1].body).model).toBe("acme/plain-chat");
  });

  it("ai.agent (JSON answers) swaps a model that can't give one for the default", async () => {
    chat = [json(200, { model: "anthropic/claude-sonnet-5.5", choices: [{ message: { content: '{"say":"hi"}' } }] })];
    const res = await aiRouter.createCaller(MEMBER).agent({ system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(res).toEqual({ result: '{"say":"hi"}', provider: "openrouter" });
    const body = JSON.parse(mockFetch.mock.calls.find((c) => String(c[0]).endsWith("/chat/completions"))![1].body);
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("ai.agent shows OpenRouter's own message when the key is out of credit", async () => {
    chat = [json(402, { error: { code: 402, message: "Insufficient credits. Add more using https://openrouter.ai/credits" } })];
    await expect(aiRouter.createCaller(MEMBER).agent({ system: "s", messages: [{ role: "user", content: "hi" }] }))
      .rejects.toThrow("AI request failed: OpenRouter error 402 — this key is out of credit: Insufficient credits. Add more using https://openrouter.ai/credits");
  });

  it("ai.assist shows OpenRouter's own message for a revoked key", async () => {
    chat = [json(401, { error: { code: 401, message: "No auth credentials found" } })];
    await expect(aiRouter.createCaller(MEMBER).assist({ systemPrompt: "s", userContent: "u" }))
      .rejects.toThrow("AI request failed: OpenRouter error 401 — the key is wrong or has been revoked: No auth credentials found");
  });

  it("aiSettings.test asks the saved key, with the workspace's model", async () => {
    expect(await aiSettingsRouter.createCaller(OWNER).test({ provider: "openrouter" })).toEqual({ ok: true, model: "anthropic/claude-sonnet-5.5" });
    expect(JSON.parse(mockFetch.mock.calls.find((c) => String(c[0]).endsWith("/chat/completions"))![1].body).model).toBe("acme/plain-chat");
  });

  it("the provider id is accepted wherever the browser sends one", async () => {
    const res = await aiRouter.createCaller(MEMBER).assist({ systemPrompt: "s", userContent: "u", provider: "openrouter" });
    expect(res.provider).toBe("openrouter");
  });
});

describe("LevelUp's shared OpenRouter key (Platform console)", () => {
  const OPERATOR = { user: { id: 1, role: "admin", platformRole: "operator", openId: "op" } } as any;

  it("only the operator can save it, it is checked first, and only a masked hint comes back", async () => {
    await expect(aiSettingsRouter.createCaller(MEMBER).platformSet({ openrouter: KEY })).rejects.toThrow(/platform operator/);
    expect(settings.platformAiKey_openrouter).toBeUndefined();
    keyAnswer = () => json(401, { error: { code: 401, message: "User not found." } });
    await expect(aiSettingsRouter.createCaller(OPERATOR).platformSet({ openrouter: "sk-or-v1-wrong" })).rejects.toThrow(/401 — the key is wrong or has been revoked/);
    expect(settings.platformAiKey_openrouter).toBeUndefined();
    keyAnswer = () => json(200, { data: { limit: null, limit_remaining: 7.25, usage: 1 } });
    const r: any = await aiSettingsRouter.createCaller(OPERATOR).platformSet({ openrouter: KEY, openrouterModel: "anthropic/claude-sonnet-5.5", openrouterAnyModel: false });
    expect(settings.platformAiKey_openrouter).toBe(KEY);
    expect(settings.platformAiModel_openrouter).toBe("anthropic/claude-sonnet-5.5");
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(r.keys.openrouter).toEqual({ configured: true, hint: "sk-or-…abcd" });
    expect(r.check).toMatchObject({ checked: true, limitRemaining: 7.25 });
  });
});
