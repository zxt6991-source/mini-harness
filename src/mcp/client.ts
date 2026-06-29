// 该文件实现基于 HTTP 的 MCP 客户端，负责列出工具、调用工具和解析 JSON-RPC 响应。
import { logger } from '../reliability/logger';
import {
  MCP_PROTOCOL_VERSION,
  McpError,
  type JsonRpcResponse,
  type McpCallToolResult,
  type McpGetPromptInput,
  type McpGetPromptResult,
  type McpInitializeResult,
  type McpListPromptsResult,
  type McpListResourcesResult,
  type McpListToolsResult,
  type McpReadResourceResult,
  createJsonRpcNotification,
  createJsonRpcRequest,
} from './protocol';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers?: {
    get(name: string): string | null;
  };
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
  initialize?(): Promise<McpInitializeResult>;
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
  clientInfo?: {
    name: string;
    version?: string;
  };
  capabilities?: Record<string, unknown>;
  requestTimeoutMs?: number;
  fetchFn?: McpFetch;
  headers?: Record<string, string>;
}

/** 调用运行时内置 fetch，作为 MCP HTTP 请求的默认实现。 */
function defaultFetch(url: string, init: Parameters<McpFetch>[1]) {
  return fetch(url, init);
}

/** 判断未知值是否为非空对象，便于安全解析 JSON-RPC 响应。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 判断 MCP HTTP 状态码是否适合由上层进行重试。 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** 从 MCP HTTP 错误响应中读取可用于日志和异常的文本消息。 */
async function readHttpError(response: FetchResponseLike): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `MCP request failed with status ${response.status}`;
  }
}

/** 基于 HTTP JSON-RPC 的 MCP 客户端，支持工具发现和工具调用。 */
export class HttpMcpClient implements McpClient {
  readonly serverName: string;

  private readonly endpoint: string;
  private readonly protocolVersion: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchFn: McpFetch;
  private sessionId?: string;
  private initializePromise?: Promise<McpInitializeResult>;
  private initializeResult?: McpInitializeResult;
  private nextId = 1;

  /** 初始化 MCP endpoint、协议版本、超时、请求头和 fetch 实现。 */
  constructor(private readonly options: HttpMcpClientOptions) {
    this.endpoint = options.endpoint;
    this.serverName = options.serverName ?? options.endpoint;
    this.protocolVersion = options.protocolVersion ?? MCP_PROTOCOL_VERSION;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.fetchFn = options.fetchFn ?? defaultFetch;
  }

  /** 执行 MCP 生命周期握手，并发送 initialized notification；多次调用只握手一次。 */
  async initialize(): Promise<McpInitializeResult> {
    if (this.initializeResult) {
      return this.initializeResult;
    }

    this.initializePromise ??= this.performInitialize().finally(() => {
      if (!this.initializeResult) {
        this.initializePromise = undefined;
      }
    });

    return this.initializePromise;
  }

  /** 调用 MCP tools/list，按可选 cursor 拉取一页工具列表。 */
  async listTools(cursor?: string): Promise<McpListToolsResult> {
    const params = cursor ? { cursor } : {};
    return this.request<McpListToolsResult>('tools/list', params);
  }

  /** 调用 MCP tools/call，执行指定工具并返回 MCP 工具结果。 */
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

  /** 调用 MCP resources/list，按可选 cursor 拉取一页资源列表。 */
  async listResources(cursor?: string): Promise<McpListResourcesResult> {
    const params = cursor ? { cursor } : {};
    return this.request<McpListResourcesResult>('resources/list', params);
  }

  /** 调用 MCP resources/read，读取指定 URI 的资源内容。 */
  async readResource(uri: string): Promise<McpReadResourceResult> {
    return this.request<McpReadResourceResult>('resources/read', { uri });
  }

  /** 调用 MCP prompts/list，按可选 cursor 拉取一页 prompt 列表。 */
  async listPrompts(cursor?: string): Promise<McpListPromptsResult> {
    const params = cursor ? { cursor } : {};
    return this.request<McpListPromptsResult>('prompts/list', params);
  }

  /** 调用 MCP prompts/get，获取参数化 prompt 生成的消息。 */
  async getPrompt(input: McpGetPromptInput): Promise<McpGetPromptResult> {
    return this.request<McpGetPromptResult>('prompts/get', {
      name: input.name,
      ...(input.arguments ? { arguments: input.arguments } : {}),
    });
  }

  /** 完成 initialize 请求和 initialized notification。 */
  private async performInitialize(): Promise<McpInitializeResult> {
    const result = await this.request<McpInitializeResult>('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: this.options.capabilities ?? {},
      clientInfo: this.options.clientInfo ?? {
        name: 'MiniHarness',
        version: '0.1.0',
      },
    });

    await this.notify('notifications/initialized');
    this.initializeResult = result;
    return result;
  }

  /** 发送 JSON-RPC notification，接受 2xx/202 空响应。 */
  private async notify(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(createJsonRpcNotification(method, params)),
        signal: controller.signal,
      });

      this.captureSessionId(response);

      if (!response.ok) {
        throw new McpError(await readHttpError(response), 'MCP_HTTP_ERROR', {
          status: response.status,
          retryable: isRetryableStatus(response.status),
        });
      }
    } catch (error) {
      if (error instanceof McpError) {
        this.logFailure({}, error, startedAt);
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

      this.logFailure({}, normalized, startedAt);
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 发送一条 MCP JSON-RPC 请求，处理 HTTP、超时、网络和协议层错误。 */
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
        headers: this.buildHeaders(),
        body: JSON.stringify(createJsonRpcRequest(id, method, params)),
        signal: controller.signal,
      });

      this.captureSessionId(response);

      if (!response.ok) {
        throw new McpError(await readHttpError(response), 'MCP_HTTP_ERROR', {
          status: response.status,
          retryable: isRetryableStatus(response.status),
        });
      }

      const body = await this.readResponseBody(response, id);
      return this.parseResponse<T>(body, id);
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

  /** 生成 MCP HTTP 请求头，自动带上协议版本、自定义 headers 和 session id。 */
  private buildHeaders(): Record<string, string> {
    return {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': this.protocolVersion,
      ...this.options.headers,
      ...(this.sessionId ? { 'MCP-Session-Id': this.sessionId } : {}),
    };
  }

  /** 从 MCP HTTP 响应头提取 session id，供后续请求复用。 */
  private captureSessionId(response: FetchResponseLike): void {
    const sessionId = response.headers?.get('MCP-Session-Id');
    if (sessionId) {
      this.sessionId = sessionId;
    }
  }

  /** 根据响应内容类型读取 JSON-RPC body，兼容 JSON 与 text/event-stream。 */
  private async readResponseBody(
    response: FetchResponseLike,
    requestId: number,
  ): Promise<unknown> {
    const contentType = response.headers?.get('content-type')?.toLowerCase() ?? '';

    if (contentType.includes('text/event-stream')) {
      return this.parseSseResponse(await response.text(), requestId);
    }

    return response.json();
  }

  /** 从 SSE 文本中提取匹配当前 request id 的 JSON-RPC 响应。 */
  private parseSseResponse(body: string, requestId: number): unknown {
    const events = body.split(/\r?\n\r?\n/);

    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trimStart())
        .join('\n')
        .trim();

      if (!data || data === '[DONE]') {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch (error) {
        throw new McpError('MCP SSE event was not valid JSON', 'MCP_RESPONSE_INVALID', {
          retryable: true,
          cause: error,
        });
      }

      if (!isObject(parsed) || parsed.id === requestId) {
        return parsed;
      }
    }

    throw new McpError('MCP SSE response missing matching result', 'MCP_RESPONSE_INVALID', {
      retryable: true,
    });
  }

  /** 校验并解析 MCP JSON-RPC 响应体，返回 result 或抛出标准 MCP 错误。 */
  private parseResponse<T>(body: unknown, requestId: number): T {
    if (!isObject(body)) {
      throw new McpError('MCP response was not an object', 'MCP_RESPONSE_INVALID', {
        retryable: true,
      });
    }

    const response = body as unknown as JsonRpcResponse<T>;
    if (response.id !== requestId) {
      throw new McpError('MCP response id did not match request id', 'MCP_RESPONSE_INVALID', {
        retryable: true,
      });
    }

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

  /** 记录 MCP 请求失败日志，保留服务、工具、trace 和延迟信息。 */
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
