import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
  Tool,
  ToolContext,
  ToolResult,
} from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import { Engine } from '../src/runtime/engine';
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

function createTool(
  name: string,
  call: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>,
): Tool {
  return {
    name,
    description: name,
    schema: { type: 'object' },
    call,
  };
}

describe('runtime tool scheduling', () => {
  it('runs tools concurrently but appends tool messages in call order', async () => {
    let releaseSlow!: () => void;
    let resolveSlowStarted!: () => void;
    let resolveFastStarted!: () => void;
    const slowStarted = new Promise<void>((resolve) => {
      resolveSlowStarted = resolve;
    });
    const fastStarted = new Promise<void>((resolve) => {
      resolveFastStarted = resolve;
    });

    const registry = new DefaultToolRegistry();
    registry.register(
      createTool('slow', async () => {
        resolveSlowStarted();
        await new Promise<void>((resolve) => {
          releaseSlow = resolve;
        });
        return { success: true, content: 'slow result' };
      }),
    );
    registry.register(
      createTool('fast', async () => {
        resolveFastStarted();
        return { success: true, content: 'fast result' };
      }),
    );

    const provider = new SequenceProvider([
      assistant('call tools', [
        { id: 'call_slow', name: 'slow', arguments: {} },
        { id: 'call_fast', name: 'fast', arguments: {} },
      ]),
      assistant('final'),
    ]);
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      maxConcurrentTools: 2,
    });

    const runPromise = engine.run('hello', 'session_1');
    await slowStarted;

    const fastStartedBeforeSlowFinished = await Promise.race([
      fastStarted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10)),
    ]);
    releaseSlow();

    await expect(runPromise).resolves.toMatchObject({
      role: 'assistant',
      content: 'final',
    });
    expect(fastStartedBeforeSlowFinished).toBe(true);
    expect(provider.calls[1]?.messages.slice(-2)).toMatchObject([
      { id: 'call_slow', role: 'tool', content: 'slow result' },
      { id: 'call_fast', role: 'tool', content: 'fast result' },
    ]);
  });

  it('can convert missing tool errors into tool observations', async () => {
    const provider = new SequenceProvider([
      assistant('call missing', [
        { id: 'call_missing', name: 'missing', arguments: {} },
      ]),
      assistant('recovered'),
    ]);
    const engine = new Engine(provider, new InMemoryStore(), new DefaultToolRegistry(), {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      toolErrorMode: 'observe',
    });

    await expect(engine.run('hello', 'session_1')).resolves.toMatchObject({
      role: 'assistant',
      content: 'recovered',
    });
    expect(provider.calls[1]?.messages.at(-1)).toMatchObject({
      id: 'call_missing',
      role: 'tool',
      metadata: {
        toolCallId: 'call_missing',
        toolName: 'missing',
        success: false,
        errorCode: 'TOOL_NOT_FOUND',
      },
    });
    expect(provider.calls[1]?.messages.at(-1)?.content).toContain(
      'Tool not found: missing',
    );
  });
});
