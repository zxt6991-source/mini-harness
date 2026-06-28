import { describe, expect, it } from 'vitest';
import type { Memory, MemoryRunEndEvent, Message, ModelProvider } from '../src/core';
import { Engine } from '../src/runtime/engine';
import { DefaultToolRegistry } from '../src/tools/registry';

class LifecycleMemory implements Memory {
  readonly messages: Message[] = [];
  readonly runEndEvents: MemoryRunEndEvent[] = [];

  async save(_sessionId: string, message: Message): Promise<void> {
    this.messages.push(message);
  }

  async loadRecent(): Promise<Message[]> {
    return this.messages;
  }

  async search(): Promise<Message[]> {
    return [];
  }

  async buildContext(_sessionId: string, input: Message): Promise<Message[]> {
    return [
      {
        id: 'system',
        role: 'system',
        content: 'System',
        createdAt: 1,
      },
      input,
    ];
  }

  async onRunEnd(event: MemoryRunEndEvent): Promise<void> {
    this.runEndEvents.push(event);
  }
}

class StaticProvider implements ModelProvider {
  readonly name = 'static';

  async chat(): Promise<{ message: Message }> {
    return {
      message: {
        id: 'assistant_1',
        role: 'assistant',
        content: 'final answer',
        createdAt: Date.now(),
      },
    };
  }
}

describe('Engine memory lifecycle', () => {
  it('notifies memory on successful run end', async () => {
    const memory = new LifecycleMemory();
    const engine = new Engine(
      new StaticProvider(),
      memory,
      new DefaultToolRegistry(),
      {
        maxSteps: 3,
        requestTimeoutMs: 1000,
        enableStream: false,
      },
    );

    await engine.run('hello', 's1');

    expect(memory.runEndEvents).toHaveLength(1);
    expect(memory.runEndEvents[0]).toMatchObject({
      sessionId: 's1',
      traceId: expect.any(String),
      finalMessage: { content: 'final answer' },
      terminationReason: 'no_tool_calls',
    });
  });
});
