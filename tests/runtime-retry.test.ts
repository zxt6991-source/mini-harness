import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { ModelProviderError } from '../src/core';
import { Engine } from '../src/runtime/engine';
import { InMemoryStore } from '../src/memory/local-store';
import {
  getRetryDelayMs,
  resolveRetryPolicy,
  runWithTimeout,
} from '../src/runtime/retry';
import { DefaultToolRegistry } from '../src/tools/registry';

class FlakyProvider implements ModelProvider {
  name = 'flaky';
  calls: ModelChatInput[] = [];
  attempts = 0;

  constructor(
    private readonly failures: ModelProviderError[],
    private readonly output: Message,
  ) {}

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    this.calls.push(input);
    const failure = this.failures[this.attempts];
    this.attempts++;

    if (failure) {
      throw failure;
    }

    return { message: this.output };
  }
}

function assistant(content: string): Message {
  return {
    id: `assistant_${content}`,
    role: 'assistant',
    content,
    createdAt: Date.now(),
  };
}

describe('runtime model retry', () => {
  it('applies bounded jitter to retry delays when configured', () => {
    const policy = resolveRetryPolicy({
      initialBackoffMs: 100,
      maxBackoffMs: 1_000,
      jitterRatio: 0.5,
    });

    expect(getRetryDelayMs(2, policy, () => 0.5)).toBe(250);
  });

  it(
    'wraps long-running operations with a reusable timeout error',
    async () => {
      class CustomTimeoutError extends Error {
        code = 'CUSTOM_TIMEOUT';
      }

      await expect(
        runWithTimeout(
          () => new Promise((resolve) => setTimeout(() => resolve('late'), 25)),
          1,
          () => new CustomTimeoutError('operation timed out'),
        ),
      ).rejects.toMatchObject({
        code: 'CUSTOM_TIMEOUT',
        message: 'operation timed out',
      });
    },
    500,
  );

  it('retries retryable model errors before returning a final message', async () => {
    const provider = new FlakyProvider(
      [
        new ModelProviderError('temporary outage', 'MODEL_TEMPORARY', {
          retryable: true,
        }),
      ],
      assistant('done'),
    );
    const engine = new Engine(provider, new InMemoryStore(), new DefaultToolRegistry(), {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      modelRetry: {
        maxRetries: 1,
        initialBackoffMs: 0,
        maxBackoffMs: 0,
      },
    });

    const events = [];
    for await (const event of engine.runEvents('hello', 'session_1')) {
      events.push(event);
    }

    expect(provider.calls).toHaveLength(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'runtime_error',
        phase: 'model',
        errorCode: 'MODEL_TEMPORARY',
        retryable: true,
        metadata: {
          attempt: 1,
          willRetry: true,
        },
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: 'agent_end',
      message: {
        content: 'done',
      },
    });
  });

  it('does not retry non-retryable model errors', async () => {
    const provider = new FlakyProvider(
      [
        new ModelProviderError('bad request', 'MODEL_BAD_REQUEST', {
          retryable: false,
        }),
      ],
      assistant('done'),
    );
    const engine = new Engine(provider, new InMemoryStore(), new DefaultToolRegistry(), {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      modelRetry: {
        maxRetries: 2,
        initialBackoffMs: 0,
        maxBackoffMs: 0,
      },
    });

    await expect(engine.run('hello', 'session_1')).rejects.toMatchObject({
      code: 'MODEL_BAD_REQUEST',
    });
    expect(provider.calls).toHaveLength(1);
  });
});
