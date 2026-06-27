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
});
