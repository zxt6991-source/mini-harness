import { describe, expect, it } from 'vitest';
import type { ModelChatInput } from '../src/core';
import {
  MaxStepsExceededError,
  MiniHarnessError,
  ModelProviderError,
  ToolNotFoundError,
} from '../src/core';
import { createId } from '../src/utils/id';

describe('core errors and id helper', () => {
  it('creates ids with the requested prefix', () => {
    const id = createId('msg');

    expect(id).toMatch(/^msg_[\w-]{12}$/);
  });

  it('preserves MiniHarness error codes', () => {
    const error = new MiniHarnessError('boom', 'BOOM');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MiniHarnessError');
    expect(error.code).toBe('BOOM');
  });

  it('uses stable codes for common runtime errors', () => {
    expect(new ToolNotFoundError('echo').code).toBe('TOOL_NOT_FOUND');
    expect(new MaxStepsExceededError(2).code).toBe('MAX_STEPS_EXCEEDED');
  });

  it('captures model provider error metadata', () => {
    const error = new ModelProviderError('rate limited', 'OPENAI_HTTP_ERROR', {
      status: 429,
      retryable: true,
    });

    expect(error).toMatchObject({
      code: 'OPENAI_HTTP_ERROR',
      status: 429,
      retryable: true,
    });
  });

  it('allows model chat input metadata for tracing', () => {
    const input: ModelChatInput = {
      messages: [],
      metadata: {
        traceId: 'trace_1',
        sessionId: 'session_1',
      },
    };

    expect(input.metadata).toEqual({
      traceId: 'trace_1',
      sessionId: 'session_1',
    });
  });
});
