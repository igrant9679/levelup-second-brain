import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock invokeLLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "AI response text" } }],
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

import { aiRouter } from "./routers/ai";
import { invokeLLM } from "./_core/llm";

describe("ai.assist procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call invokeLLM with the provided system prompt and user content", async () => {
    const caller = aiRouter.createCaller({} as any);
    const result = await caller.assist({
      systemPrompt: "You are a helpful assistant.",
      userContent: "Expand this journal entry: Today was a good day.",
    });

    expect(invokeLLM).toHaveBeenCalledWith({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Expand this journal entry: Today was a good day." },
      ],
    });
    expect(result.result).toBe("AI response text");
  });

  it("should return fallback message when LLM returns no content", async () => {
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

  it("should reject input exceeding max length", async () => {
    const caller = aiRouter.createCaller({} as any);
    await expect(
      caller.assist({
        systemPrompt: "A".repeat(4001),
        userContent: "short",
      })
    ).rejects.toThrow();
  });
});
