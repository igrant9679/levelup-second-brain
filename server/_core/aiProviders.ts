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
      model: "claude-haiku-4-5",
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
  const model = "gemini-2.5-flash";
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

// ─── Multi-turn chat (build -196, the in-app agent) ─────────────────────────
// callAIProvider() is single-turn (system + one user string), which forced the
// chat to paste its transcript INTO the system prompt and budget it under the
// 4000-char cap. The agent needs real turns — the model has to see its own
// proposed actions and the tool results that followed — so this is the same
// provider dispatch with a proper messages[] array.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CallProviderChatOptions {
  provider: AIProvider;
  apiKey?: string;
  system: string;
  messages: ChatTurn[];
  /** Ask the model for a single JSON object. */
  jsonMode?: boolean;
  maxTokens?: number;
}

/**
 * Anthropic rejects transcripts that do not start with a user turn or that
 * repeat a role back-to-back; Gemini is lenient but behaves better with the
 * same shape. Merge adjacent same-role turns and drop a leading assistant turn.
 */
export function normalizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    if (!t || typeof t.content !== "string") continue;
    const content = t.content.trim();
    if (!content) continue;
    const role = t.role === "assistant" ? "assistant" : "user";
    if (!out.length && role === "assistant") continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else out.push({ role, content });
  }
  if (!out.length) out.push({ role: "user", content: "(continue)" });
  // Providers want the LAST turn to be the user's — if the transcript ends on
  // the assistant, give the model an explicit prompt to continue.
  if (out[out.length - 1].role === "assistant") out.push({ role: "user", content: "(continue)" });
  return out;
}

const JSON_ONLY = "\n\nRespond with ONLY one valid JSON object. No prose before or after it, no markdown fences.";

async function chatOpenAI(o: CallProviderChatOptions): Promise<string> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: o.system }, ...normalizeTurns(o.messages)],
      max_tokens: o.maxTokens ?? 2000,
      ...(o.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatClaude(o: CallProviderChatOptions): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": o.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system: o.jsonMode ? o.system + JSON_ONLY : o.system,
      messages: normalizeTurns(o.messages),
      max_tokens: o.maxTokens ?? 2000,
    }),
  });
  if (!resp.ok) throw new Error(`Claude error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as { content: Array<{ type: string; text: string }> };
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

async function chatGemini(o: CallProviderChatOptions): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${o.apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: o.system }] },
      contents: normalizeTurns(o.messages).map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: o.maxTokens ?? 2000,
        ...(o.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = (await resp.json()) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

async function chatManus(o: CallProviderChatOptions): Promise<string> {
  const response = await invokeLLM({
    messages: [{ role: "system", content: o.system }, ...normalizeTurns(o.messages)],
    maxTokens: o.maxTokens ?? 2000,
    ...(o.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });
  const content = response?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

/** Multi-turn twin of callAIProvider, same fallback semantics. */
export async function callAIProviderChat(o: CallProviderChatOptions): Promise<{
  text: string;
  providerUsed: AIProvider;
}> {
  const wantCustom =
    (o.provider === "openai" || o.provider === "claude" || o.provider === "gemini") && !!o.apiKey;
  try {
    if (wantCustom) {
      let text = "";
      if (o.provider === "openai") text = await chatOpenAI(o);
      else if (o.provider === "claude") text = await chatClaude(o);
      else if (o.provider === "gemini") text = await chatGemini(o);
      return { text, providerUsed: o.provider };
    }
    return { text: await chatManus(o), providerUsed: "manus" };
  } catch (err) {
    if (wantCustom) {
      try {
        return { text: await chatManus(o), providerUsed: "manus" };
      } catch {
        throw err;
      }
    }
    throw err;
  }
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
