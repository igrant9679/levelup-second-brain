// Shared AI provider dispatch. Used by ai.assist, bookmarks.suggestTags, and any
// other server-side feature that wants to honor the user's chosen provider + key.
//
// Falls back to the built-in Manus LLM when no provider key is supplied.

import { invokeLLM } from "./llm";

export type AIProvider = "manus" | "openai" | "claude" | "gemini";

export interface CallProviderOptions {
  provider: AIProvider;
  apiKey?: string;
  systemPrompt: string;
  userContent: string;
  /** When set, ask the model to return strict JSON. */
  jsonMode?: boolean;
  maxTokens?: number;
}

async function callOpenAI(opts: CallProviderOptions): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userContent },
      ],
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callClaude(opts: CallProviderOptions): Promise<string> {
  // Anthropic does not have a strict JSON mode like OpenAI; we instruct in the prompt.
  const sys = opts.jsonMode
    ? `${opts.systemPrompt}\n\nReturn ONLY a valid JSON object, no commentary.`
    : opts.systemPrompt;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      system: sys,
      messages: [{ role: "user", content: opts.userContent }],
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

async function callGemini(opts: CallProviderOptions): Promise<string> {
  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: opts.userContent }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1024,
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = (await resp.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callManus(opts: CallProviderOptions): Promise<string> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userContent },
    ],
    ...(opts.jsonMode
      ? { response_format: { type: "json_object" as const } }
      : {}),
  });
  const content = response?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Call an AI provider with automatic fallback to Manus on failure.
 * Returns the raw text content (caller can JSON.parse if jsonMode was true).
 */
export async function callAIProvider(opts: CallProviderOptions): Promise<{
  text: string;
  providerUsed: AIProvider;
}> {
  const wantCustom =
    (opts.provider === "openai" ||
      opts.provider === "claude" ||
      opts.provider === "gemini") &&
    !!opts.apiKey;

  try {
    if (wantCustom) {
      let text = "";
      if (opts.provider === "openai") text = await callOpenAI(opts);
      else if (opts.provider === "claude") text = await callClaude(opts);
      else if (opts.provider === "gemini") text = await callGemini(opts);
      return { text, providerUsed: opts.provider };
    }
    const text = await callManus(opts);
    return { text, providerUsed: "manus" };
  } catch (err) {
    // If the user-chosen provider failed, try Manus as a fallback.
    if (wantCustom) {
      try {
        const text = await callManus(opts);
        return { text, providerUsed: "manus" };
      } catch {
        // Re-throw the ORIGINAL provider error so the user sees what their key did.
        throw err;
      }
    }
    throw err;
  }
}
