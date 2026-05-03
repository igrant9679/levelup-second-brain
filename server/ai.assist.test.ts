import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock invokeLLM (Manus built-in)
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Manus AI response" } }],
  }),
}));

// Mock env
vi.mock("./_core/env", () => ({
  env: {
    DATABASE_URL: "mysql://test",
    JWT_SECRET: "test-secret",
    VITE_APP_ID: "test-app-id",
    OAUTH_SERVER_URL: "https://api.manus.im",
    BUILT_IN_FORGE_API_URL: "https://forge.manus.im",
    BUILT_IN_FORGE_API_KEY: "test-key",
    VITE_FRONTEND_FORGE_API_KEY: "test-frontend-key",
    VITE_FRONTEND_FORGE_API_URL: "https://forge.manus.im",
  },
}));

// Mock global fetch for external provider calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { aiRouter } from "./routers/ai";
import { invokeLLM } from "./_core/llm";

describe("ai.assist procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Manus (default) ──────────────────────────────────────────────────────────

  it("should use Manus built-in LLM when provider is 'manus'", async () => {
    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "You are a helpful assistant.",
      userContent: "Expand this journal entry: Today was a good day.",
      provider: "manus",
    });

    expect(invokeLLM).toHaveBeenCalledWith({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Expand this journal entry: Today was a good day." },
      ],
    });
    expect(result.result).toBe("Manus AI response");
    expect(result.provider).toBe("manus");
  });

  it("should use Manus built-in LLM when no provider is specified", async () => {
    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "System",
      userContent: "User content",
    });

    expect(invokeLLM).toHaveBeenCalled();
    expect(result.result).toBe("Manus AI response");
  });

  // ─── OpenAI ───────────────────────────────────────────────────────────────────

  it("should call OpenAI API when provider is 'openai' and apiKey is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OpenAI response" } }],
      }),
    });

    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "You are a helpful assistant.",
      userContent: "Validate this idea.",
      provider: "openai",
      apiKey: "sk-test-openai-key",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-openai-key",
        }),
      })
    );
    expect(result.result).toBe("OpenAI response");
    expect(result.provider).toBe("openai");
  });

  // ─── Claude ───────────────────────────────────────────────────────────────────

  it("should call Anthropic Claude API when provider is 'claude' and apiKey is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Claude response" }],
      }),
    });

    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "You are a helpful assistant.",
      userContent: "Summarise this note.",
      provider: "claude",
      apiKey: "sk-ant-test-claude-key",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-test-claude-key",
        }),
      })
    );
    expect(result.result).toBe("Claude response");
    expect(result.provider).toBe("claude");
  });

  // ─── Gemini ───────────────────────────────────────────────────────────────────

  it("should call Google Gemini API when provider is 'gemini' and apiKey is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Gemini response" }] } }],
      }),
    });

    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "You are a helpful assistant.",
      userContent: "ICE score this idea.",
      provider: "gemini",
      apiKey: "AIza-test-gemini-key",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result.result).toBe("Gemini response");
    expect(result.provider).toBe("gemini");
  });

  // ─── Fallback ─────────────────────────────────────────────────────────────────

  it("should fall back to Manus LLM when OpenAI call fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "System",
      userContent: "User content",
      provider: "openai",
      apiKey: "bad-key",
    });

    // Should fall back to Manus
    expect(invokeLLM).toHaveBeenCalled();
    expect(result.result).toBe("Manus AI response");
  });

  // ─── Validation ───────────────────────────────────────────────────────────────

  it("should reject systemPrompt exceeding 4000 characters", async () => {
    const caller = aiRouter.createCaller({} as any);
    await expect(
      caller.assist({
        systemPrompt: "A".repeat(4001),
        userContent: "short",
      })
    ).rejects.toThrow();
  });

  it("should reject userContent exceeding 8000 characters", async () => {
    const caller = aiRouter.createCaller({} as any);
    await expect(
      caller.assist({
        systemPrompt: "System",
        userContent: "B".repeat(8001),
      })
    ).rejects.toThrow();
  });

  it("should return fallback message when Manus LLM returns no content", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    } as any);

    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "System",
      userContent: "User content",
    });

    expect(result.result).toBe("No response generated.");
  });
});
