import { describe, expect, it, vi } from 'vitest';
import type { McpFetch } from '../src/mcp/client';
import { HttpMcpClient } from '../src/mcp/client';
import { McpError, createJsonRpcRequest } from '../src/mcp/protocol';

function responseHeaders(headers: Record<string, string | undefined> = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    get: vi.fn((name: string) => normalized.get(name.toLowerCase()) ?? null),
  };
}

function jsonResponse(
  body: unknown,
  init: {
    ok?: boolean;
    status?: number;
    contentType?: string;
    sessionId?: string;
  } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: responseHeaders({
      'content-type': init.contentType ?? 'application/json',
      'mcp-session-id': init.sessionId,
    }),
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

function textResponse(
  body: string,
  init: {
    ok?: boolean;
    status?: number;
    contentType?: string;
    sessionId?: string;
  } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: responseHeaders({
      'content-type': init.contentType,
      'mcp-session-id': init.sessionId,
    }),
    json: vi.fn(async () => JSON.parse(body)),
    text: vi.fn(async () => body),
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
  it('performs the MCP initialize lifecycle once and reuses the session id', async () => {
    const fetchFn = vi.fn<McpFetch>(async (_url, init) => {
      const request = JSON.parse(init.body) as { id?: number; method: string };

      if (request.method === 'initialize') {
        return jsonResponse(
          {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'demo', version: '1.0.0' },
            },
          },
          { sessionId: 'session_1' },
        );
      }

      if (request.method === 'notifications/initialized') {
        return textResponse('', { status: 202, sessionId: 'session_1' });
      }

      if (request.method === 'tools/list') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: { tools: [] },
        });
      }

      throw new Error(`Unexpected method: ${request.method}`);
    });
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn,
      clientInfo: { name: 'MiniHarnessTest', version: '0.1.0' },
    });

    await client.initialize();
    await client.initialize();
    await client.listTools();

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1].body))).toMatchObject({
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'MiniHarnessTest', version: '0.1.0' },
      },
    });
    expect(JSON.parse(String(fetchFn.mock.calls[1]![1].body))).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(fetchFn.mock.calls[2]![1].headers).toMatchObject({
      'MCP-Session-Id': 'session_1',
    });
  });

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

  it('parses Streamable HTTP text/event-stream JSON-RPC responses', async () => {
    const fetchFn = vi.fn<McpFetch>(async () =>
      textResponse(
        [
          'event: message',
          'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"echo","description":"Echo text","inputSchema":{"type":"object"}}]}}',
          '',
        ].join('\n'),
        { contentType: 'text/event-stream' },
      ),
    );
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn,
    });

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [{ name: 'echo' }],
    });
  });

  it('supports MCP resource and prompt primitives through client methods', async () => {
    const fetchFn = vi.fn<McpFetch>(async (_url, init) => {
      const request = JSON.parse(init.body) as { id: number; method: string };

      if (request.method === 'resources/list') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: [
              {
                uri: 'file:///workspace/README.md',
                name: 'README',
                mimeType: 'text/markdown',
              },
            ],
          },
        });
      }

      if (request.method === 'resources/read') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            contents: [
              {
                uri: 'file:///workspace/README.md',
                mimeType: 'text/markdown',
                text: '# MiniHarness',
              },
            ],
          },
        });
      }

      if (request.method === 'prompts/list') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            prompts: [
              {
                name: 'review',
                description: 'Review code',
                arguments: [],
              },
            ],
          },
        });
      }

      if (request.method === 'prompts/get') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: {
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: 'Review this file' },
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected method: ${request.method}`);
    });
    const client = new HttpMcpClient({
      endpoint: 'https://example.com/mcp',
      fetchFn,
    });

    await expect(client.listResources()).resolves.toMatchObject({
      resources: [{ name: 'README' }],
    });
    await expect(client.readResource('file:///workspace/README.md')).resolves.toMatchObject({
      contents: [{ text: '# MiniHarness' }],
    });
    await expect(client.listPrompts()).resolves.toMatchObject({
      prompts: [{ name: 'review' }],
    });
    await expect(
      client.getPrompt({
        name: 'review',
        arguments: { focus: 'correctness' },
      }),
    ).resolves.toMatchObject({
      messages: [{ role: 'user' }],
    });

    expect(fetchFn.mock.calls.map((call) => JSON.parse(String(call[1].body)).method)).toEqual([
      'resources/list',
      'resources/read',
      'prompts/list',
      'prompts/get',
    ]);
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
