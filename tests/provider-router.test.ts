import { describe, expect, it } from 'vitest';
import {
  ModelProviderError,
  type ModelChatInput,
  type ModelChatOutput,
  type ModelProvider,
} from '../src/core';
import { CircuitBreaker } from '../src/models/circuit-breaker';
import { ProviderRouter } from '../src/models/provider-router';

function provider(name: string, behavior: 'pass' | 'fail'): ModelProvider {
  return {
    name,
    async chat(_input: ModelChatInput): Promise<ModelChatOutput> {
      if (behavior === 'fail') {
        throw new ModelProviderError(`${name} failed`, 'MODEL_FAILED', {
          retryable: true,
        });
      }

      return {
        message: {
          id: `msg_${name}`,
          role: 'assistant',
          content: name,
          createdAt: Date.now(),
        },
      };
    },
  };
}

describe('ProviderRouter', () => {
  it('falls back to the next provider when primary fails', async () => {
    const router = new ProviderRouter({
      providers: [provider('primary', 'fail'), provider('fallback', 'pass')],
      failureThreshold: 1,
      resetTimeoutMs: 60000,
    });

    await expect(router.chat({ messages: [] })).resolves.toMatchObject({
      message: { content: 'fallback' },
    });
  });

  it('throws a model error when every provider fails', async () => {
    const router = new ProviderRouter({
      providers: [provider('primary', 'fail'), provider('fallback', 'fail')],
      failureThreshold: 1,
      resetTimeoutMs: 60000,
    });

    await expect(router.chat({ messages: [] })).rejects.toMatchObject({
      code: 'MODEL_ROUTER_EXHAUSTED',
      retryable: true,
    });
  });
});

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and half-opens after reset timeout', () => {
    let now = 1000;
    const breaker = new CircuitBreaker(2, 500, () => now);

    breaker.recordFailure();
    expect(breaker.state).toBe('closed');

    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    expect(breaker.isAvailable()).toBe(false);

    now = 1600;
    expect(breaker.isAvailable()).toBe(true);
    expect(breaker.state).toBe('half-open');

    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');
  });
});
