import { describe, expect, it, vi } from 'vitest';
import { ModelProviderError } from '../src/core';
import type { ChatCompletionsFetch } from '../src/models/chat-completions-provider';
import { ChatCompletionsProvider } from '../src/models/chat-completions-provider';
import { EchoTool } from '../src/tools/builtin/echo';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

describe('ChatCompletionsProvider', () => {
  it('sends chat completion requests with messages, tools, options, and auth', async () => {
    const fetchFn = vi.fn<ChatCompletionsFetch>(async () =>
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }),
    );
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn,
    });

    await provider.chat({
      messages: [
        { id: 'msg_1', role: 'system', content: 'sys', createdAt: Date.now() },
        { id: 'msg_2', role: 'user', content: 'hello', createdAt: Date.now() },
        {
          id: 'msg_3',
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'echo', arguments: { text: 'hi' } }],
          createdAt: Date.now(),
        },
        { id: 'call_1', role: 'tool', content: 'hi', createdAt: Date.now() },
      ],
      tools: [new EchoTool()],
      options: { temperature: 0.2, maxTokens: 64, timeoutMs: 1_000 },
      metadata: { traceId: 'trace_1', sessionId: 'session_1' },
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'deepseek-test',
      temperature: 0.2,
      max_tokens: 64,
      stream: false,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'echo', arguments: '{"text":"hi"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'hi' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'echo',
            description: 'Return the input text directly.',
          },
        },
      ],
    });
  });

  it('normalizes missing API keys', async () => {
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: '',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn: vi.fn(),
    });

    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'DEEPSEEK_API_KEY_MISSING',
      retryable: false,
    });
  });

  it('normalizes retryable HTTP errors', async () => {
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn: vi.fn(async () =>
        jsonResponse({ error: { message: 'rate limited' } }, { ok: false, status: 429 }),
      ),
    });

    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'DEEPSEEK_HTTP_ERROR',
      status: 429,
      retryable: true,
    });
  });

  it('normalizes network errors', async () => {
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn: vi.fn(async () => {
        throw new TypeError('network failed');
      }),
    });

    await expect(provider.chat({ messages: [] })).rejects.toBeInstanceOf(
      ModelProviderError,
    );
    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'DEEPSEEK_NETWORK_ERROR',
      retryable: true,
    });
  });
});
