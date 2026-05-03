import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock invokeLLM
vi.mock('./_core/llm', () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from './_core/llm';

// Simulate the suggestFollowUps logic (extracted for unit testing)
async function suggestFollowUpsLogic(subject: string, body: string): Promise<string[]> {
  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a helpful email writing assistant. Always respond with valid JSON only.' },
      { role: 'user', content: `Subject: ${subject}\nBody: ${body}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'follow_up_suggestions',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['suggestions'],
          additionalProperties: false,
        },
      },
    },
  } as Parameters<typeof invokeLLM>[0]);

  const rawContent = (response as any).choices?.[0]?.message?.content;
  const content = typeof rawContent === 'string' ? rawContent : '{"suggestions":[]}';
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(content);
    suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
  } catch {
    suggestions = [];
  }
  return suggestions.slice(0, 3);
}

describe('suggestFollowUps logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns up to 3 suggestions from LLM response', async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { content: '{"suggestions":["Follow up 1","Follow up 2","Follow up 3"]}' } }],
    });

    const result = await suggestFollowUpsLogic('Test Subject', 'Test body text');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Follow up 1');
    expect(result[2]).toBe('Follow up 3');
  });

  it('handles array response format (no wrapper object)', async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { content: '["Suggestion A","Suggestion B","Suggestion C"]' } }],
    });

    const result = await suggestFollowUpsLogic('Subject', 'Body');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Suggestion A');
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { content: 'not valid json' } }],
    });

    const result = await suggestFollowUpsLogic('Subject', 'Body');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when LLM returns no content', async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const result = await suggestFollowUpsLogic('Subject', 'Body');
    expect(result).toHaveLength(0);
  });

  it('caps results at 3 even if LLM returns more', async () => {
    (invokeLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      choices: [{ message: { content: '{"suggestions":["A","B","C","D","E"]}' } }],
    });

    const result = await suggestFollowUpsLogic('Subject', 'Body');
    expect(result).toHaveLength(3);
  });
});
