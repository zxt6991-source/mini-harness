import { describe, expect, it, vi } from 'vitest';
import type { McpClient } from '../src/mcp/client';
import { discoverMcpTools } from '../src/mcp/discovery';
import type { McpInitializeResult } from '../src/mcp/protocol';

describe('discoverMcpTools', () => {
  it('discovers all paginated MCP tools as adapters', async () => {
    const client: McpClient = {
      serverName: 'demo',
      listTools: vi
        .fn()
        .mockResolvedValueOnce({
          tools: [
            {
              name: 'first',
              title: 'First Tool',
              description: 'First',
              inputSchema: { type: 'object' },
            },
          ],
          nextCursor: 'next',
        })
        .mockResolvedValueOnce({
          tools: [
            {
              name: 'second',
              description: 'Second',
              inputSchema: { type: 'object' },
            },
          ],
        }),
      callTool: vi.fn(),
    };

    const tools = await discoverMcpTools(client);

    expect(client.listTools).toHaveBeenNthCalledWith(1, undefined);
    expect(client.listTools).toHaveBeenNthCalledWith(2, 'next');
    expect(tools.map((tool) => tool.name)).toEqual(['first', 'second']);
    expect(tools[0]).toMatchObject({
      description: 'First',
      schema: { type: 'object' },
    });
  });

  it('returns an empty list when the server has no tools', async () => {
    const client: McpClient = {
      serverName: 'empty',
      listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(),
    };

    await expect(discoverMcpTools(client)).resolves.toEqual([]);
  });

  it('uses a TTL cache to avoid repeated tools/list calls', async () => {
    const client: McpClient = {
      serverName: 'cached',
      listTools: vi.fn(async () => ({
        tools: [
          {
            name: 'cached_tool',
            description: 'Cached',
            inputSchema: { type: 'object' },
          },
        ],
      })),
      callTool: vi.fn(),
    };
    const now = vi.fn(() => 1_000);

    const first = await discoverMcpTools(client, { cacheTtlMs: 10_000, now });
    const second = await discoverMcpTools(client, { cacheTtlMs: 10_000, now });

    expect(client.listTools).toHaveBeenCalledTimes(1);
    expect(first.map((tool) => tool.name)).toEqual(['cached_tool']);
    expect(second.map((tool) => tool.name)).toEqual(['cached_tool']);
  });

  it('can force refresh a cached discovery result', async () => {
    const client: McpClient = {
      serverName: 'refresh',
      listTools: vi
        .fn()
        .mockResolvedValueOnce({
          tools: [
            {
              name: 'old_tool',
              description: 'Old',
              inputSchema: { type: 'object' },
            },
          ],
        })
        .mockResolvedValueOnce({
          tools: [
            {
              name: 'new_tool',
              description: 'New',
              inputSchema: { type: 'object' },
            },
          ],
        }),
      callTool: vi.fn(),
    };

    await expect(
      discoverMcpTools(client, { cacheTtlMs: 10_000 }),
    ).resolves.toHaveLength(1);
    const refreshed = await discoverMcpTools(client, {
      cacheTtlMs: 10_000,
      forceRefresh: true,
    });

    expect(client.listTools).toHaveBeenCalledTimes(2);
    expect(refreshed.map((tool) => tool.name)).toEqual(['new_tool']);
  });

  it('initializes clients that expose an initialize lifecycle hook before discovery', async () => {
    const client: McpClient & { initialize: () => Promise<McpInitializeResult> } = {
      serverName: 'initializable',
      initialize: vi.fn(async () => ({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'initializable' },
      })),
      listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(),
    };

    await discoverMcpTools(client, { forceRefresh: true });

    const initializeOrder = vi.mocked(client.initialize).mock.invocationCallOrder[0];
    const listToolsOrder = vi.mocked(client.listTools).mock.invocationCallOrder[0];

    expect(initializeOrder).toBeLessThan(listToolsOrder);
  });
});
