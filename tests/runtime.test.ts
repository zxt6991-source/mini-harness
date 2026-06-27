import { describe, expect, it } from 'vitest';
import type {
  Memory,
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { MaxStepsExceededError, ToolNotFoundError } from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import type { McpClient } from '../src/mcp/client';
import { discoverMcpTools } from '../src/mcp/discovery';
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

describe('Engine', () => {
  it('returns an assistant message when the model does not request tools', async () => {
    const provider = new SequenceProvider([assistant('done')]);
    const memory = new InMemoryStore();
    const registry = new DefaultToolRegistry();
    const engine = new Engine(provider, memory, registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    const result = await engine.run('hello', 'session_1');

    expect(result).toMatchObject({
      role: 'assistant',
      content: 'done',
    });
    await expect(memory.loadRecent('session_1', 10)).resolves.toMatchObject([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'done' },
    ]);
    expect(provider.calls[0]?.tools).toEqual([]);
  });

  it('passes trace and session metadata to the model provider', async () => {
    const provider = new SequenceProvider([assistant('done')]);
    const engine = new Engine(provider, new InMemoryStore(), new DefaultToolRegistry(), {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    await engine.run('hello', 'session_1');

    expect(provider.calls[0]?.metadata).toMatchObject({
      sessionId: 'session_1',
    });
    expect(provider.calls[0]?.metadata?.traceId).toMatch(/^msg_[\w-]{12}$/);
  });

  it('executes tool calls and loops until a final assistant message', async () => {
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
    const memory = new InMemoryStore();
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());

    const engine = new Engine(provider, memory, registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    await expect(engine.run('hello', 'session_1')).resolves.toMatchObject({
      role: 'assistant',
      content: 'final',
    });
    await expect(memory.loadRecent('session_1', 10)).resolves.toMatchObject([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'call tool' },
      { role: 'tool', content: 'from tool' },
      { role: 'assistant', content: 'final' },
    ]);
    expect(provider.calls[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      content: 'from tool',
    });
  });

  it('can execute discovered MCP tools through the registry', async () => {
    const client: McpClient = {
      serverName: 'demo',
      listTools: async () => ({
        tools: [
          {
            name: 'mcp_echo',
            description: 'MCP echo',
            inputSchema: { type: 'object' },
          },
        ],
      }),
      callTool: async () => ({
        content: [{ type: 'text', text: 'from mcp' }],
        isError: false,
      }),
    };
    const registry = new DefaultToolRegistry();
    for (const tool of await discoverMcpTools(client)) {
      registry.register(tool);
    }
    const provider = new SequenceProvider([
      assistant('call mcp', [
        {
          id: 'call_1',
          name: 'mcp_echo',
          arguments: { text: 'hello' },
        },
      ]),
      assistant('final'),
    ]);
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    await expect(engine.run('hello', 'session_1')).resolves.toMatchObject({
      role: 'assistant',
      content: 'final',
    });
    expect(provider.calls[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      content: 'from mcp',
      metadata: {
        mcpServerName: 'demo',
        mcpToolName: 'mcp_echo',
      },
    });
  });

  it('throws when a requested tool is missing', async () => {
    const provider = new SequenceProvider([
      assistant('missing tool', [
        {
          id: 'call_1',
          name: 'missing',
          arguments: {},
        },
      ]),
    ]);
    const engine = new Engine(provider, new InMemoryStore(), new DefaultToolRegistry(), {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
    });

    await expect(engine.run('hello', 'session_1')).rejects.toBeInstanceOf(
      ToolNotFoundError,
    );
  });

  it('throws when model tool calls exceed maxSteps', async () => {
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

    await expect(engine.run('hello', 'session_1')).rejects.toBeInstanceOf(
      MaxStepsExceededError,
    );
  });
});
