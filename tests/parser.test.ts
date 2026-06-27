import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../src/core';
import { ensureModelOutput } from '../src/models/quality-gate';
import { parseOpenAIResponse } from '../src/models/parser';

describe('parseOpenAIResponse', () => {
  it('parses assistant text from Responses API output messages', () => {
    const output = parseOpenAIResponse({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'Hello' },
            { type: 'output_text', text: ' world' },
          ],
        },
      ],
      usage: {
        input_tokens: 3,
        output_tokens: 4,
        total_tokens: 7,
      },
    });

    expect(output.message).toMatchObject({
      role: 'assistant',
      content: 'Hello world',
    });
    expect(output.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
  });

  it('parses function_call output items into internal tool calls', () => {
    const output = parseOpenAIResponse({
      output: [
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'echo',
          arguments: '{"text":"hello"}',
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

  it('throws a model error when function arguments are invalid JSON', () => {
    expect(() =>
      parseOpenAIResponse({
        output: [
          {
            type: 'function_call',
            id: 'fc_1',
            name: 'echo',
            arguments: '{"text"',
          },
        ],
      }),
    ).toThrow(ModelProviderError);
  });

  it('rejects empty model output in the quality gate', () => {
    expect(() =>
      ensureModelOutput({
        message: {
          id: 'msg_1',
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
        },
      }),
    ).toThrow('Model returned an empty response');
  });
});
