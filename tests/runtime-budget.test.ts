import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { RuntimeBudgetExceededError } from '../src/runtime/budget';
import { Engine } from '../src/runtime/engine';
import { InMemoryStore } from '../src/memory/local-store';
import { EchoTool } from '../src/tools/builtin/echo';
import { DefaultToolRegistry } from '../src/tools/registry';

class SequenceProvider implements ModelProvider {
  name = 'sequence';
  calls: ModelChatInput[] = [];

  constructor(private readonly outputs: Message[]) {}

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    this.calls.push(input);
    const message = this.outputs.shift();

    if (!message) {
      throw new Error('No model output configured');
    }

    return { message };
  }
}

function assistant(content: string, toolCalls: Message['toolCalls'] = []): Message {
  return {
    id: `assistant_${content}`,
    role: 'assistant',
    content,
    toolCalls,
    createdAt: Date.now(),
  };
}

describe('runtime budget management', () => {
  it('blocks the next model call when the task model-call budget is exhausted', async () => {
    const provider = new SequenceProvider([
      assistant('call tool', [
        {
          id: 'call_1',
          name: 'echo',
          arguments: { text: 'from tool' },
        },
      ]),
      assistant('final'),
    ]);
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      budget: {
        maxModelCalls: 1,
        maxEstimatedTokens: 1_000_000,
        maxContextCharacters: 1_000_000,
        reserveOutputTokens: 0,
      },
    });

    await expect(engine.run('hello', 'session_1')).rejects.toBeInstanceOf(
      RuntimeBudgetExceededError,
    );
    expect(provider.calls).toHaveLength(1);
  });
});
