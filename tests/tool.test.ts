import { describe, expect, it, vi } from 'vitest';
import type { Tool, ToolContext } from '../src/core';
import { ToolNotFoundError } from '../src/core';
import { SecurityGuard } from '../src/security/guard';
import { EchoTool } from '../src/tools/builtin/echo';
import { ToolExecutor } from '../src/tools/executor';
import { DefaultToolRegistry } from '../src/tools/registry';

const ctx: ToolContext = {
  traceId: 'trace_1',
  sessionId: 'session_1',
};

describe('DefaultToolRegistry', () => {
  it('registers and gets a tool', () => {
    const registry = new DefaultToolRegistry();
    const tool = new EchoTool();

    registry.register(tool);

    expect(registry.get('echo')).toBe(tool);
    expect(registry.list()).toEqual([tool]);
  });

  it('rejects duplicate tool registrations', () => {
    const registry = new DefaultToolRegistry();
    const tool = new EchoTool();

    registry.register(tool);

    expect(() => registry.register(tool)).toThrow('Tool already registered: echo');
  });

  it('executes registered tools as tool messages', async () => {
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());

    const result = await registry.execute(
      {
        id: 'call_1',
        name: 'echo',
        arguments: { text: 'hello' },
      },
      ctx,
    );

    expect(result).toMatchObject({
      id: 'call_1',
      role: 'tool',
      content: 'hello',
      metadata: {
        toolName: 'echo',
        success: true,
      },
    });
  });

  it('preserves tool call ids in tool message metadata', async () => {
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());

    const result = await registry.execute(
      {
        id: 'call_1',
        name: 'echo',
        arguments: { text: 'ok' },
      },
      ctx,
    );

    expect(result).toMatchObject({
      id: 'call_1',
      role: 'tool',
      metadata: {
        toolCallId: 'call_1',
        toolName: 'echo',
        success: true,
      },
    });
  });

  it('throws ToolNotFoundError for unknown tools', async () => {
    const registry = new DefaultToolRegistry();

    await expect(
      registry.execute(
        {
          id: 'call_1',
          name: 'missing',
          arguments: {},
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it('can execute registered tools through a ToolExecutor', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: ['echo'],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: false,
      allowedShellCommands: [],
    });
    const registry = new DefaultToolRegistry(new ToolExecutor(guard));
    registry.register(new EchoTool());

    await expect(
      registry.execute(
        {
          id: 'call_1',
          name: 'echo',
          arguments: { text: 'blocked' },
        },
        ctx,
      ),
    ).rejects.toThrow('Tool denied by policy: echo');
  });
});

describe('EchoTool', () => {
  it('returns string input text', async () => {
    const result = await new EchoTool().call({ text: 'echo me' }, ctx);

    expect(result).toEqual({
      success: true,
      content: 'echo me',
    });
  });

  it('returns an empty string when text is missing', async () => {
    const result = await new EchoTool().call({}, ctx);

    expect(result.content).toBe('');
  });
});

describe('ToolExecutor', () => {
  it('checks permission before executing a tool', async () => {
    const guard = new SecurityGuard({
      allowTools: [],
      denyTools: ['echo'],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: false,
      allowedShellCommands: [],
    });
    const tool: Tool = {
      name: 'echo',
      description: 'Echo',
      schema: {},
      call: vi.fn(async () => ({ success: true, content: 'not called' })),
    };

    await expect(new ToolExecutor(guard).execute(tool, {}, ctx)).rejects.toThrow(
      'Tool denied by policy: echo',
    );
    expect(tool.call).not.toHaveBeenCalled();
  });

  it('returns tool results when permission passes', async () => {
    const guard = new SecurityGuard({
      allowTools: ['echo'],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: false,
      allowShell: false,
      allowedShellCommands: [],
    });

    await expect(
      new ToolExecutor(guard).execute(new EchoTool(), { text: 'ok' }, ctx),
    ).resolves.toEqual({
      success: true,
      content: 'ok',
    });
  });
});
