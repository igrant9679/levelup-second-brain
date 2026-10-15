/**
 * -214: the workspace AI keys never reach the browser.
 *  - aiSettings.get returns {configured, hint} per provider, never the key;
 *  - only the workspace owner can change keys (teammates are all admins);
 *  - ai.assist / ai.agent / help.askAI with no apiKey use the workspace
 *    provider + key resolved on the server; an explicit key still wins
 *    (deploy skew, the Settings "Test" button).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const settings: Record<string, string> = {};
vi.mock("./db", () => ({
  getSystemSetting: vi.fn(async (k: string) => settings[k]),
  setSystemSetting: vi.fn(async (k: string, v: string) => { settings[k] = v; }),
}));
vi.mock("./routers/appData", () => ({
  isOwnerCtxUser: vi.fn(async (u: { id: number }) => u.id === 1),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({ choices: [{ message: { content: "Manus AI response" } }] }),
}));
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { aiSettingsRouter } from "./routers/aiSettings";
import { aiRouter } from "./routers/ai";
import { helpRouter } from "./routers/help";
import { invalidateWorkspaceAI, maskKey, resolveRequestAI } from "./_core/workspaceAI";

const OWNER = { user: { id: 1, role: "admin" } } as any;
const TEAMMATE = { user: { id: 7, role: "admin" } } as any;
const CLAUDE_KEY = "sk-ant-api03-SECRETSECRETSECRET-wxyz";

const claudeOk = (text: string) => ({ ok: true, json: async () => ({ content: [{ type: "text", text }] }) });

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k];
  settings.aiProvider = "claude";
  settings.aiKey_claude = CLAUDE_KEY;
  invalidateWorkspaceAI();
  mockFetch.mockReset();
});

describe("maskKey", () => {
  it("keeps the recognisable prefix and the last 4 only", () => {
    expect(maskKey(CLAUDE_KEY)).toBe("sk-ant-…wxyz");
    expect(maskKey("sk-proj-abcdefghijklmnop1234")).toBe("sk-…1234");
    expect(maskKey("AIzaSyABCDEFGHIJKLMNOP9876")).toBe("AIza…9876");
    expect(maskKey("short")).toBe("…");
    expect(maskKey("")).toBe("");
  });
});

describe("aiSettings.get", () => {
  it("never returns a raw key, to anyone", async () => {
    for (const ctx of [OWNER, TEAMMATE]) {
      const res = await aiSettingsRouter.createCaller(ctx).get();
      expect(JSON.stringify(res)).not.toContain("SECRET");
      expect(res.keys.claude).toEqual({ configured: true, hint: "sk-ant-…wxyz" });
      expect(res.keys.openai).toEqual({ configured: false, hint: "" });
      expect(res.provider).toBe("claude");
    }
  });
  it("tells only the owner they can edit", async () => {
    expect((await aiSettingsRouter.createCaller(OWNER).get()).canEdit).toBe(true);
    expect((await aiSettingsRouter.createCaller(TEAMMATE).get()).canEdit).toBe(false);
  });
});

describe("aiSettings.set", () => {
  it("refuses a non-owner admin", async () => {
    await expect(aiSettingsRouter.createCaller(TEAMMATE).set({ claude: "sk-ant-evil" })).rejects.toThrow(/owner/i);
    expect(settings.aiKey_claude).toBe(CLAUDE_KEY);
  });
  it("lets the owner replace a key, and the new key applies at once", async () => {
    await resolveRequestAI({}); // warm the 5-minute cache
    await aiSettingsRouter.createCaller(OWNER).set({ claude: "  sk-ant-api03-NEWNEWNEWNEWNEW-1111 " });
    expect(settings.aiKey_claude).toBe("sk-ant-api03-NEWNEWNEWNEWNEW-1111");
    expect((await resolveRequestAI({})).apiKey).toBe("sk-ant-api03-NEWNEWNEWNEWNEW-1111");
  });
});

describe("server-side key resolution", () => {
  it("ai.assist with no apiKey uses the workspace provider + key", async () => {
    mockFetch.mockResolvedValueOnce(claudeOk("from workspace claude"));
    const res = await aiRouter.createCaller(TEAMMATE).assist({ systemPrompt: "s", userContent: "u", provider: "openai" });
    expect(res.result).toBe("from workspace claude");
    expect(res.provider).toBe("claude");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ headers: expect.objectContaining({ "x-api-key": CLAUDE_KEY }) }),
    );
  });
  it("ai.agent with no apiKey uses the workspace key", async () => {
    mockFetch.mockResolvedValueOnce(claudeOk('{"say":"hi"}'));
    const res = await aiRouter.createCaller(TEAMMATE).agent({ system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(res.provider).toBe("claude");
    expect(mockFetch.mock.calls[0][1].headers["x-api-key"]).toBe(CLAUDE_KEY);
  });
  it("help.askAI with no apiKey uses the workspace key", async () => {
    mockFetch.mockResolvedValueOnce(claudeOk("help answer"));
    const res = await helpRouter.createCaller(TEAMMATE).askAI({ question: "how do habits work" });
    expect(res.answer).toBe("help answer");
    expect(mockFetch.mock.calls[0][1].headers["x-api-key"]).toBe(CLAUDE_KEY);
  });
  it("an explicit apiKey (pre-214 client, Settings Test) still wins", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "typed key" } }] }) });
    const res = await aiRouter.createCaller(TEAMMATE).assist({ systemPrompt: "s", userContent: "u", provider: "openai", apiKey: "sk-typed-1234567890" });
    expect(res.provider).toBe("openai");
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-typed-1234567890");
  });
  it("falls back to another configured provider when the chosen one has no key", async () => {
    delete settings.aiKey_claude;
    settings.aiKey_gemini = "AIzaSyABCDEFGHIJKLMNOP9876";
    expect(await resolveRequestAI({})).toEqual({ provider: "gemini", apiKey: "AIzaSyABCDEFGHIJKLMNOP9876" });
  });
});

describe("aiSettings.test", () => {
  it("tests the SAVED key without the browser sending it", async () => {
    mockFetch.mockResolvedValueOnce(claudeOk("OK"));
    expect(await aiSettingsRouter.createCaller(TEAMMATE).test({ provider: "claude" })).toEqual({ ok: true });
    expect(mockFetch.mock.calls[0][1].headers["x-api-key"]).toBe(CLAUDE_KEY);
  });
  it("says so when nothing is saved", async () => {
    await expect(aiSettingsRouter.createCaller(OWNER).test({ provider: "openai" })).rejects.toThrow(/No openai key/);
  });
});
