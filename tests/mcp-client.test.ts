import { describe, expect, it, vi } from 'vitest';
import type { McpFetch } from '../src/mcp/client';
import { HttpMcpClient } from '../src/mcp/client';
import { McpError, createJsonRpcRequest } from '../src/mcp/protocol';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

describe('MCP protocol helpers', () => {
  it('creates JSON-RPC requests with stable protocol fields', () => {
    expect(createJsonRpcRequest(1, 'tools/list', { cursor: 'abc' })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { cursor: 'abc' },
    });
  });

  it('captures MCP error metadata', () => {
    const error = new McpError('bad gateway', 'MCP_HTTP_ERROR', {
      status: 502,
      retryable: true,
    });

    expect(error).toMatchObject({
      code: 'MCP_HTTP_ERROR',
      status: 502,
      retryable: true,
    });
  });
});

describe('HttpMcpClient', () => {
  it('sends tools/list requests to the MCP endpoint', async () => {
    const fetchFn = vi.fn<McpFetch>(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: [
            {
              name: 'echo',
              description: 'Echo text',
              inputSchema: { type: 'object' },
            },
          ],
        },
      }),
    );
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn,
      serverName: 'example',
    });

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'echo' }],
    });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://example.com/mcp');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends tools/call requests', async () => {
    const fetchFn = vi.fn<McpFetch>(async () =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: 'hello' }],
          isError: false,
        },
      }),
    );
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn,
    });

    await expect(
      client.callTool({
        name: 'echo',
        arguments: { text: 'hello' },
        traceId: 'trace_1',
      }),
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'hello' }],
      isError: false,
    });

    expect(JSON.parse(String(fetchFn.mock.calls[0]![1].body))).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'echo',
        arguments: { text: 'hello' },
      },
    });
  });

  it('normalizes HTTP errors', async () => {
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn: vi.fn(async () =>
        jsonResponse({ error: 'bad gateway' }, { ok: false, status: 502 }),
      ),
    });

    await expect(client.listTools()).rejects.toMatchObject({
      code: 'MCP_HTTP_ERROR',
      status: 502,
      retryable: true,
    });
  });

  it('normalizes JSON-RPC errors', async () => {
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn: vi.fn(async () =>
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32601,
            message: 'method not found',
          },
        }),
      ),
    });

    await expect(client.listTools()).rejects.toMatchObject({
      code: 'MCP_RPC_ERROR',
      retryable: false,
    });
  });

  it('normalizes network errors', async () => {
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn: vi.fn(async () => {
        throw new TypeError('network failed');
      }),
    });

    await expect(client.listTools()).rejects.toMatchObject({
      code: 'MCP_NETWORK_ERROR',
      retryable: true,
    });
  });
});
