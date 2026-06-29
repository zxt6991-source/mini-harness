import { describe, expect, it, vi } from 'vitest';
import type { McpClient } from '../src/mcp/client';
import { McpToolAdapter } from '../src/mcp/adapter';

const ctx = {
  traceId: 'trace_1',
  sessionId: 'session_1',
};

describe('McpToolAdapter', () => {
  it('calls MCP tools and returns text content', async () => {
    const client: McpClient = {
      serverName: 'demo',
      listTools: vi.fn(),
      callTool: vi.fn(async () => ({
        content: [{ type: 'text', text: 'hello' }],
        isError: false,
      })),
    };
    const adapter = new McpToolAdapter(
      {
        name: 'echo',
        description: 'Echo text',
        inputSchema: { type: 'object' },
      },
      client,
    );

    await expect(adapter.call({ text: 'hello' }, ctx)).resolves.toMatchObject({
      success: true,
      content: 'hello',
      metadata: {
        mcpServerName: 'demo',
        mcpToolName: 'echo',
      },
    });
    expect(client.callTool).toHaveBeenCalledWith({
      name: 'echo',
      arguments: { text: 'hello' },
      traceId: 'trace_1',
    });
  });

  it('serializes non-text MCP content into readable content and metadata', async () => {
    const client: McpClient = {
      serverName: 'demo',
      listTools: vi.fn(),
      callTool: vi.fn(async () => ({
        content: [
          { type: 'image', mimeType: 'image/png', data: 'abc' },
          { type: 'resource_link', uri: 'file:///tmp/a.txt', name: 'a.txt' },
        ],
        isError: false,
      })),
    };
    const adapter = new McpToolAdapter(
      {
        name: 'inspect',
        description: 'Inspect',
        inputSchema: {},
      },
      client,
    );

    const result = await adapter.call({}, ctx);

    expect(result.content).toContain('[image:image/png]');
    expect(result.content).toContain('[resource:file:///tmp/a.txt]');
    expect(result.metadata?.mcpContent).toHaveLength(2);
  });

  it('maps MCP isError results to failed tool results without throwing', async () => {
    const client: McpClient = {
      serverName: 'demo',
      listTools: vi.fn(),
      callTool: vi.fn(async () => ({
        content: [{ type: 'text', text: 'tool failed' }],
        isError: true,
      })),
    };
    const adapter = new McpToolAdapter(
      {
        name: 'fail',
        description: 'Fail',
        inputSchema: {},
      },
      client,
    );

    await expect(adapter.call({}, ctx)).resolves.toMatchObject({
      success: false,
      content: 'tool failed',
    });
  });

  it('can expose a prefixed internal name while calling the original MCP tool', async () => {
    const client: McpClient = {
      serverName: 'local tools',
      listTools: vi.fn(),
      callTool: vi.fn(async () => ({
        content: [{ type: 'text', text: 'hello' }],
        isError: false,
      })),
    };
    const adapter = new McpToolAdapter(
      {
        name: 'echo',
        description: 'Echo text',
        inputSchema: { type: 'object' },
      },
      client,
      { namePrefix: 'mcp_local_tools' },
    );

    expect(adapter.name).toBe('mcp_local_tools_echo');
    expect(adapter.capability).toMatchObject({
      category: 'mcp',
      source: 'mcp',
      metadata: {
        mcpServerName: 'local tools',
        mcpToolName: 'echo',
      },
    });

    const result = await adapter.call({ text: 'hello' }, ctx);

    expect(client.callTool).toHaveBeenCalledWith({
      name: 'echo',
      arguments: { text: 'hello' },
      traceId: 'trace_1',
    });
    expect(result.metadata).toMatchObject({
      mcpToolName: 'echo',
      internalToolName: 'mcp_local_tools_echo',
    });
  });

  it('sanitizes unsafe and long MCP tool names while preserving remote calls', async () => {
    const originalToolName = `workspace/search files:${'x'.repeat(80)}`;
    const client: McpClient = {
      serverName: 'unsafe server',
      listTools: vi.fn(),
      callTool: vi.fn(async () => ({
        content: [{ type: 'text', text: 'found' }],
        isError: false,
      })),
    };
    const adapter = new McpToolAdapter(
      {
        name: originalToolName,
        description: 'Search files',
        inputSchema: { type: 'object' },
      },
      client,
    );

    expect(adapter.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(adapter.name).not.toBe(originalToolName);

    const result = await adapter.call({ query: 'todo' }, ctx);

    expect(client.callTool).toHaveBeenCalledWith({
      name: originalToolName,
      arguments: { query: 'todo' },
      traceId: 'trace_1',
    });
    expect(result.metadata).toMatchObject({
      mcpServerName: 'unsafe server',
      mcpToolName: originalToolName,
      mcpOriginalName: originalToolName,
      internalToolName: adapter.name,
    });
  });
});
