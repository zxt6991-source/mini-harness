import { describe, expect, it, vi } from 'vitest';
import type { McpClient } from '../src/mcp/client';
import { discoverMcpTools } from '../src/mcp/discovery';

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
});
