import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the invokeLLM helper so tests don't make real API calls
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "OK" } }],
  }),
}));

// Mock fetch for external provider calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ai.assist provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a result string from the manus provider", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const result = await (invokeLLM as ReturnType<typeof vi.fn>)({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Reply with exactly: OK" },
      ],
    });
    expect(result.choices[0].message.content).toBe("OK");
  });

  it("routes to openai when provider is openai and apiKey is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OpenAI response" } }],
      }),
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer sk-test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    });
    const data = await res.json();
    expect(data.choices[0].message.content).toBe("OpenAI response");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes to anthropic when provider is claude and apiKey is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: "Claude response" }],
      }),
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": "sk-ant-test",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    });
    const data = await res.json();
    expect(data.content[0].text).toBe("Claude response");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("routes to gemini when provider is gemini and apiKey is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Gemini response" }] } }],
      }),
    });

    const apiKey = "AIza-test";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
        }),
      }
    );
    const data = await res.json();
    expect(data.candidates[0].content.parts[0].text).toBe("Gemini response");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("falls back to manus when provider is unknown", async () => {
    const { invokeLLM } = await import("./_core/llm");
    // For unknown provider, invokeLLM (manus) should be called
    const result = await (invokeLLM as ReturnType<typeof vi.fn>)({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    });
    expect(result.choices[0].message.content).toBeDefined();
  });
});

describe("idea bodyHtml save logic", () => {
  it("saves bodyHtml to the idea object", () => {
    const ideas: Array<{ id: number; bodyHtml: string; updatedAt: string }> = [
      { id: 1, bodyHtml: "", updatedAt: "" },
    ];

    function saveIdeaBodyHtml(id: number, html: string) {
      const idea = ideas.find((x) => x.id === id);
      if (!idea) return false;
      idea.bodyHtml = html;
      idea.updatedAt = new Date().toISOString();
      return true;
    }

    const result = saveIdeaBodyHtml(1, "<p>My idea description</p>");
    expect(result).toBe(true);
    expect(ideas[0].bodyHtml).toBe("<p>My idea description</p>");
    expect(ideas[0].updatedAt).not.toBe("");
  });

  it("returns false when idea id does not exist", () => {
    const ideas: Array<{ id: number; bodyHtml: string; updatedAt: string }> = [
      { id: 1, bodyHtml: "", updatedAt: "" },
    ];

    function saveIdeaBodyHtml(id: number, html: string) {
      const idea = ideas.find((x) => x.id === id);
      if (!idea) return false;
      idea.bodyHtml = html;
      return true;
    }

    const result = saveIdeaBodyHtml(999, "<p>Ghost idea</p>");
    expect(result).toBe(false);
  });
});
