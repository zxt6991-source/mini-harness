import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../src/core';
import { parseChatCompletionResponse } from '../src/models/chat-completions-parser';

describe('parseChatCompletionResponse', () => {
  it('parses assistant text and usage from chat completions responses', () => {
    const output = parseChatCompletionResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'hello',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
      },
    });

    expect(output.message).toMatchObject({
      role: 'assistant',
      content: 'hello',
    });
    expect(output.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
  });

  it('parses tool_calls into internal tool calls', () => {
    const output = parseChatCompletionResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'echo',
                  arguments: '{"text":"hello"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    expect(output.message).toMatchObject({
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'echo',
          arguments: { text: 'hello' },
        },
      ],
    });
  });

  it('throws a model error when tool call arguments are invalid JSON', () => {
    expect(() =>
      parseChatCompletionResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'echo',
                    arguments: '{"text"',
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(ModelProviderError);
  });

  it('rejects empty model output through the quality gate', () => {
    expect(() =>
      parseChatCompletionResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
            },
          },
        ],
      }),
    ).toThrow('Model returned an empty response');
  });
});
