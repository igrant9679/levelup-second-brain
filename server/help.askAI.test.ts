/**
 * Tests for the help.askAI tRPC procedure
 *
 * These tests verify the article relevance scoring logic and the tRPC
 * procedure's input validation, without making real LLM calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock the LLM so tests don't make real API calls ----
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "This is a mock LLM answer about LevelUp features.",
        },
      },
    ],
  }),
}));

// ---- Import after mock is set up ----
import { appRouter } from "./routers";
import { invokeLLM } from "./_core/llm";
import type { TrpcContext } from "./_core/context";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("help.askAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      choices: [
        {
          message: {
            content: "This is a mock LLM answer about LevelUp features.",
          },
        },
      ],
    });
  });

  it("returns an answer and cited articles for a valid question", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.help.askAI({
      question: "How do I use keyboard shortcuts?",
      conversationHistory: [],
    });

    expect(result.answer).toBeTruthy();
    expect(typeof result.answer).toBe("string");
    expect(Array.isArray(result.citedArticles)).toBe(true);
    expect(result.citedArticles.length).toBeGreaterThan(0);
  });

  it("includes article id, title, and slug in citedArticles", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.help.askAI({
      question: "What keyboard shortcuts are available?",
      conversationHistory: [],
    });

    for (const article of result.citedArticles) {
      expect(article).toHaveProperty("id");
      expect(article).toHaveProperty("title");
      expect(article).toHaveProperty("slug");
      expect(typeof article.id).toBe("number");
      expect(typeof article.title).toBe("string");
      expect(typeof article.slug).toBe("string");
    }
  });

  it("calls invokeLLM with a system prompt containing article content", async () => {
    const caller = appRouter.createCaller(createCtx());
    await caller.help.askAI({
      question: "How do I track habits?",
      conversationHistory: [],
    });

    expect(invokeLLM).toHaveBeenCalledOnce();
    const callArgs = (invokeLLM as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.messages).toBeDefined();
    expect(callArgs.messages[0].role).toBe("system");
    expect(callArgs.messages[0].content).toContain("LevelUp Help Assistant");
    // The last message should be the user's question
    const lastMsg = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMsg.role).toBe("user");
    expect(lastMsg.content).toBe("How do I track habits?");
  });

  it("includes conversation history in the LLM call", async () => {
    const caller = appRouter.createCaller(createCtx());
    const history = [
      { role: "user" as const, content: "What is LevelUp?" },
      { role: "assistant" as const, content: "LevelUp is a second brain app." },
    ];

    await caller.help.askAI({
      question: "Tell me more about tasks",
      conversationHistory: history,
    });

    const callArgs = (invokeLLM as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const messages = callArgs.messages;
    // Should have: system + 2 history + 1 user question = 4 messages
    expect(messages.length).toBe(4);
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("What is LevelUp?");
    expect(messages[2].role).toBe("assistant");
  });

  it("rejects empty questions", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.help.askAI({ question: "", conversationHistory: [] })
    ).rejects.toThrow();
  });

  it("rejects questions longer than 500 characters", async () => {
    const caller = appRouter.createCaller(createCtx());
    const longQuestion = "a".repeat(501);
    await expect(
      caller.help.askAI({ question: longQuestion, conversationHistory: [] })
    ).rejects.toThrow();
  });

  it("handles LLM errors gracefully by propagating them", async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("LLM service unavailable")
    );
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.help.askAI({ question: "How do I use notes?", conversationHistory: [] })
    ).rejects.toThrow("LLM service unavailable");
  });

  it("surfaces keyboard shortcuts article for shortcut questions", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.help.askAI({
      question: "keyboard shortcuts",
      conversationHistory: [],
    });

    const citedSlugs = result.citedArticles.map((a) => a.slug);
    expect(citedSlugs).toContain("keyboard-shortcuts");
  });

  it("surfaces habits article for habit-related questions", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.help.askAI({
      question: "How do habit streaks work?",
      conversationHistory: [],
    });

    const citedSlugs = result.citedArticles.map((a) => a.slug);
    expect(citedSlugs).toContain("habits-streaks");
  });
});
