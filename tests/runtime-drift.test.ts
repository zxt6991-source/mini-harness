import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import { RuntimeDriftError } from '../src/runtime/drift';
import { Engine } from '../src/runtime/engine';
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

describe('runtime drift guard', () => {
  it('stops the run when the same tool call repeats beyond the configured threshold', async () => {
    const provider = new SequenceProvider([
      assistant('again', [
        { id: 'call_1', name: 'echo', arguments: { text: 'same' } },
      ]),
      assistant('again', [
        { id: 'call_2', name: 'echo', arguments: { text: 'same' } },
      ]),
      assistant('final'),
    ]);
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      drift: {
        maxToolCalls: 10,
        repeatedToolWindow: 4,
        repeatedToolThreshold: 2,
        reflectionInterval: 0,
      },
    });

    await expect(engine.run('hello', 'session_1')).rejects.toBeInstanceOf(
      RuntimeDriftError,
    );
    expect(provider.calls).toHaveLength(2);
  });
});
