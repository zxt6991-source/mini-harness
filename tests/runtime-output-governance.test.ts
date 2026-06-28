import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import { ModelOutputGovernance } from '../src/models/output-governance';
import { Engine } from '../src/runtime/engine';
import { DefaultToolRegistry } from '../src/tools/registry';

class OneShotProvider implements ModelProvider {
  name = 'oneshot';

  constructor(private readonly output: Message) {}

  async chat(_input: ModelChatInput): Promise<ModelChatOutput> {
    return { message: this.output };
  }
}

describe('Engine output governance', () => {
  it('emits governance errors before missing tools execute', async () => {
    const provider = new OneShotProvider({
      id: 'assistant_1',
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'missing', arguments: {} }],
      createdAt: Date.now(),
    });
    const registry = new DefaultToolRegistry();
    const governance = new ModelOutputGovernance(registry, {
      enabled: true,
      mode: 'throw',
    });
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1000,
      enableStream: false,
      outputGovernance: governance,
    });

    const events: string[] = [];
    await expect(async () => {
      for await (const event of engine.runEvents('hello', 'session_1')) {
        events.push(event.type);
      }
    }).rejects.toThrow("Tool 'missing' is not registered.");

    expect(events).toContain('output_governance');
    expect(events).not.toContain('tool_start');
  });

  it('turns rejected calls into tool observations in observe mode', async () => {
    const outputs: Message[] = [
      {
        id: 'assistant_1',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', name: 'missing', arguments: {} }],
        createdAt: Date.now(),
      },
      {
        id: 'assistant_2',
        role: 'assistant',
        content: 'final',
        createdAt: Date.now(),
      },
    ];
    const provider: ModelProvider = {
      name: 'sequence',
      async chat(input) {
        const output = outputs.shift();
        if (!output) {
          throw new Error('No output');
        }

        if (output.id === 'assistant_2') {
          expect(input.messages.at(-1)).toMatchObject({
            role: 'tool',
            metadata: { success: false, errorCode: 'UNKNOWN_TOOL' },
          });
        }

        return { message: output };
      },
    };
    const registry = new DefaultToolRegistry();
    const governance = new ModelOutputGovernance(registry, {
      enabled: true,
      mode: 'observe',
    });
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1000,
      enableStream: false,
      outputGovernance: governance,
    });

    await expect(engine.run('hello', 'session_1')).resolves.toMatchObject({
      role: 'assistant',
      content: 'final',
    });
  });
});
