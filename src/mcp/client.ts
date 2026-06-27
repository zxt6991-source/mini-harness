import { logger } from '../reliability/logger';
import {
  MCP_PROTOCOL_VERSION,
  McpError,
  type JsonRpcResponse,
  type McpCallToolResult,
  type McpListToolsResult,
  createJsonRpcRequest,
} from './protocol';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type McpFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export interface McpClient {
  serverName: string;
  listTools(cursor?: string): Promise<McpListToolsResult>;
  callTool(input: {
    name: string;
    arguments: Record<string, unknown>;
    traceId?: string;
  }): Promise<McpCallToolResult>;
}

export interface HttpMcpClientOptions {
  endpoint: string;
  serverName?: string;
  protocolVersion?: string;
  requestTimeoutMs?: number;
  fetchFn?: McpFetch;
  headers?: Record<string, string>;
}

function defaultFetch(url: string, init: Parameters<McpFetch>[1]) {
  return fetch(url, init);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function readHttpError(response: FetchResponseLike): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `MCP request failed with status ${response.status}`;
  }
}

export class HttpMcpClient implements McpClient {
  readonly serverName: string;

  private readonly endpoint: string;
  private readonly protocolVersion: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: McpFetch;
  private nextId = 1;

  constructor(private readonly options: HttpMcpClientOptions) {
    this.endpoint = options.endpoint;
    this.serverName = options.serverName ?? options.endpoint;
    this.protocolVersion = options.protocolVersion ?? MCP_PROTOCOL_VERSION;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.fetchFn = options.fetchFn ?? defaultFetch;
  }

  async listTools(cursor?: string): Promise<McpListToolsResult> {
    const params = cursor ? { cursor } : {};
    return this.request<McpListToolsResult>('tools/list', params);
  }

  async callTool(input: {
    name: string;
    arguments: Record<string, unknown>;
    traceId?: string;
  }): Promise<McpCallToolResult> {
    return this.request<McpCallToolResult>(
      'tools/call',
      {
        name: input.name,
        arguments: input.arguments,
      },
      {
        traceId: input.traceId,
        toolName: input.name,
      },
    );
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown>,
    metadata: { traceId?: string; toolName?: string } = {},
  ): Promise<T> {
    const id = this.nextId++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': this.protocolVersion,
          ...this.options.headers,
        },
        body: JSON.stringify(createJsonRpcRequest(id, method, params)),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new McpError(await readHttpError(response), 'MCP_HTTP_ERROR', {
          status: response.status,
          retryable: isRetryableStatus(response.status),
        });
      }

      const body = await response.json();
      return this.parseResponse<T>(body);
    } catch (error) {
      if (error instanceof McpError) {
        this.logFailure(metadata, error, startedAt);
        throw error;
      }

      const normalized =
        error instanceof Error && error.name === 'AbortError'
          ? new McpError('MCP request timed out', 'MCP_TIMEOUT', {
              retryable: true,
              cause: error,
            })
          : new McpError('MCP network request failed', 'MCP_NETWORK_ERROR', {
              retryable: true,
              cause: error,
            });

      this.logFailure(metadata, normalized, startedAt);
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse<T>(body: unknown): T {
    if (!isObject(body)) {
      throw new McpError('MCP response was not an object', 'MCP_RESPONSE_INVALID', {
        retryable: true,
      });
    }

    const response = body as unknown as JsonRpcResponse<T>;
    if (response.error) {
      throw new McpError(response.error.message, 'MCP_RPC_ERROR', {
        retryable: false,
        rpcCode: response.error.code,
      });
    }

    if (!('result' in response)) {
      throw new McpError('MCP response missing result', 'MCP_RESPONSE_INVALID', {
        retryable: true,
      });
    }

    return response.result as T;
  }

  private logFailure(
    metadata: { traceId?: string; toolName?: string },
    error: McpError,
    startedAt: number,
  ): void {
    logger.error({
      traceId: metadata.traceId,
      serverName: this.serverName,
      toolName: metadata.toolName,
      latencyMs: Date.now() - startedAt,
      errorCode: error.code,
      status: error.status,
      retryable: error.retryable,
    });
  }
}
