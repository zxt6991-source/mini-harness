import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import { ProductionMetricsCollector } from '../src/production/metrics';
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

    return {
      message,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    };
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

describe('ProductionMetricsCollector', () => {
  it('records model, tool, token, and latency metrics from engine events', async () => {
    const metrics = new ProductionMetricsCollector();
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
      metrics,
    });

    await engine.run('hello', 'session_1');

    expect(metrics.snapshot()).toMatchObject({
      model: {
        callCount: 2,
      },
      tools: {
        callCount: 1,
        successCount: 1,
        errorCount: 0,
      },
      tokens: {
        input: 20,
        output: 10,
        total: 30,
      },
      runtime: {
        completedRuns: 1,
        errorCount: 0,
      },
    });
    expect(metrics.snapshot().tools.maxLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
