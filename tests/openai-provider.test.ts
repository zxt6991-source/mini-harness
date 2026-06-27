import { describe, expect, it, vi } from 'vitest';
import { ModelProviderError } from '../src/core';
import type { OpenAIFetch } from '../src/models/openai-provider';
import { OpenAIProvider } from '../src/models/openai-provider';
import { EchoTool } from '../src/tools/builtin/echo';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

describe('OpenAIProvider', () => {
  it('sends Responses API requests with messages, tools, options, and auth', async () => {
    const fetchFn = vi.fn<OpenAIFetch>(async () =>
      jsonResponse({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'ok' }],
          },
        ],
      }),
    );
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      fetchFn,
    });

    await provider.chat({
      messages: [
        {
          id: 'msg_1',
          role: 'user',
          content: 'hello',
          createdAt: Date.now(),
        },
      ],
      tools: [new EchoTool()],
      options: {
        temperature: 0.2,
        maxTokens: 64,
        timeoutMs: 1_000,
      },
      metadata: {
        traceId: 'trace_1',
        sessionId: 'session_1',
      },
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-test',
      input: [{ role: 'user', content: 'hello' }],
      temperature: 0.2,
      max_output_tokens: 64,
      tools: [
        {
          type: 'function',
          name: 'echo',
          description: 'Return the input text directly.',
        },
      ],
    });
  });

  it('parses text responses', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      fetchFn: vi.fn(async () =>
        jsonResponse({
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'hello' }],
            },
          ],
        }),
      ),
    });

    await expect(provider.chat({ messages: [] })).resolves.toMatchObject({
      message: {
        role: 'assistant',
        content: 'hello',
      },
    });
  });

  it('parses tool call responses', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      fetchFn: vi.fn(async () =>
        jsonResponse({
          output: [
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'echo',
              arguments: '{"text":"hi"}',
            },
          ],
        }),
      ),
    });

    await expect(provider.chat({ messages: [] })).resolves.toMatchObject({
      message: {
        toolCalls: [
          {
            id: 'call_1',
            name: 'echo',
            arguments: { text: 'hi' },
          },
        ],
      },
    });
  });

  it('requires an API key', async () => {
    const provider = new OpenAIProvider({
      apiKey: '',
      model: 'gpt-test',
      fetchFn: vi.fn(),
    });

    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'OPENAI_API_KEY_MISSING',
      retryable: false,
    });
  });

  it('normalizes HTTP errors', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      fetchFn: vi.fn(async () =>
        jsonResponse({ error: { message: 'rate limited' } }, { ok: false, status: 429 }),
      ),
    });

    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'OPENAI_HTTP_ERROR',
      status: 429,
      retryable: true,
    });
  });

  it('normalizes network errors', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      fetchFn: vi.fn(async () => {
        throw new TypeError('network failed');
      }),
    });

    await expect(provider.chat({ messages: [] })).rejects.toBeInstanceOf(
      ModelProviderError,
    );
    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'OPENAI_NETWORK_ERROR',
      retryable: true,
    });
  });
});
