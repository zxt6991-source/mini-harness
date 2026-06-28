import { describe, expect, it, vi } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
  Tool,
} from '../src/core';
import { MaxStepsExceededError } from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import { Engine } from '../src/runtime/engine';
import type { EngineEvent } from '../src/runtime/events';
import { RuntimeAbortedError } from '../src/runtime/state';
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

describe('Engine runEvents', () => {
  it('emits stable lifecycle events for a run without tools', async () => {
    const provider = new SequenceProvider([assistant('done')]);
    const engine = new Engine(provider, new InMemoryStore(), new DefaultToolRegistry(), {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    const events: EngineEvent[] = [];
    for await (const event of engine.runEvents('hello', 'session_1')) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'turn_start',
      'model_start',
      'model_message',
      'agent_end',
    ]);
    expect(events[1]).toMatchObject({
      snapshot: {
        sessionId: 'session_1',
        step: 0,
        messageCount: 1,
        modelCallCount: 0,
        toolCallCount: 0,
      },
    });
    expect(events.at(-1)).toMatchObject({
      message: {
        role: 'assistant',
        content: 'done',
      },
      snapshot: {
        terminationReason: 'no_tool_calls',
        modelCallCount: 1,
      },
    });
  });

  it('emits a runtime_error event before throwing when maxSteps is exceeded', async () => {
    const provider = new SequenceProvider([
      assistant('again', [
        {
          id: 'call_1',
          name: 'echo',
          arguments: { text: 'still going' },
        },
      ]),
    ]);
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 1,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    const events: EngineEvent[] = [];
    await expect(async () => {
      for await (const event of engine.runEvents('hello', 'session_1')) {
        events.push(event);
      }
    }).rejects.toBeInstanceOf(MaxStepsExceededError);

    expect(events.map((event) => event.type)).toContain('runtime_error');
    expect(events.at(-1)).toMatchObject({
      type: 'runtime_error',
      phase: 'termination',
      snapshot: {
        terminationReason: 'max_steps_exceeded',
        step: 1,
        modelCallCount: 1,
        toolCallCount: 1,
      },
    });
  });

  it('stops before tool execution when the run is aborted after model output', async () => {
    const provider = new SequenceProvider([
      assistant('call tool', [
        {
          id: 'call_1',
          name: 'tracked',
          arguments: {},
        },
      ]),
    ]);
    const trackedTool: Tool = {
      name: 'tracked',
      description: 'Tracked',
      schema: { type: 'object' },
      call: vi.fn(async () => ({ success: true, content: 'tool result' })),
    };
    const registry = new DefaultToolRegistry();
    registry.register(trackedTool);
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });
    const controller = new AbortController();
    const events: EngineEvent[] = [];

    await expect(async () => {
      for await (const event of engine.runEvents('hello', 'session_1', {
        abortSignal: controller.signal,
      })) {
        events.push(event);
        if (event.type === 'model_message') {
          controller.abort();
        }
      }
    }).rejects.toBeInstanceOf(RuntimeAbortedError);

    expect(trackedTool.call).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      type: 'runtime_error',
      phase: 'abort',
      snapshot: {
        terminationReason: 'aborted',
      },
    });
  });
});
