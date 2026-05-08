import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ─── Provider types ────────────────────────────────────────────────────────────
type AIProvider = "manus" | "openai" | "claude" | "gemini";

interface ProviderConfig {
  provider: AIProvider;
  apiKey?: string;
}

// ─── Provider dispatch ─────────────────────────────────────────────────────────

async function callOpenAI(
  systemPrompt: string,
  userContent: string,
  apiKey: string
): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 1024,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "No response generated.";
}

async function callClaude(
  systemPrompt: string,
  userContent: string,
  apiKey: string
): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      max_tokens: 1024,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  return (
    data.content?.find((c) => c.type === "text")?.text ??
    "No response generated."
  );
}

async function callGemini(
  systemPrompt: string,
  userContent: string,
  apiKey: string
): Promise<string> {
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
    }>;
  };
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response generated."
  );
}

async function callManus(
  systemPrompt: string,
  userContent: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });
    const content = response?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "No response generated.";
}

// ─── Router ────────────────────────────────────────────────────────────────────

export const aiRouter = router({
  /**
   * General-purpose AI assist endpoint used by the rich text editors
   * in Journal, Notes, and Ideas forms.
   *
   * Accepts an optional `provider` and `apiKey` so the frontend can pass
   * the user's chosen provider (openai / claude / gemini / manus).
   * Falls back to the Manus built-in LLM when no provider is specified.
   */
  assist: publicProcedure
    .input(
      z.object({
        systemPrompt: z.string().max(4000),
        userContent: z.string().max(8000),
        provider: z
          .enum(["manus", "openai", "claude", "gemini"])
          .optional()
          .default("manus"),
        apiKey: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { systemPrompt, userContent, provider, apiKey } = input;

      let result: string;

      try {
        if (provider === "openai" && apiKey) {
          result = await callOpenAI(systemPrompt, userContent, apiKey);
        } else if (provider === "claude" && apiKey) {
          result = await callClaude(systemPrompt, userContent, apiKey);
        } else if (provider === "gemini" && apiKey) {
          result = await callGemini(systemPrompt, userContent, apiKey);
        } else {
          // Default: Manus built-in LLM
          result = await callManus(systemPrompt, userContent);
        }
      } catch (err) {
        // If the custom provider fails, fall back to Manus built-in
        console.error(`[ai.assist] Provider "${provider}" failed:`, err);
        try {
          result = await callManus(systemPrompt, userContent);
        } catch (fallbackErr) {
          throw new Error(
            `AI request failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      return { result, provider };
    }),
});
