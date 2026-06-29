// 该文件定义 MCP JSON-RPC 协议相关类型、协议版本、错误类型和请求构造函数。
import { MiniHarnessError } from '../core';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: T;
  error?: JsonRpcErrorPayload;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: {
    name: string;
    version?: string;
  } & Record<string, unknown>;
  instructions?: string;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface McpListToolsResult {
  tools: McpTool[];
  nextCursor?: string;
}

export interface McpResource {
  uri: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  annotations?: Record<string, unknown>;
}

export interface McpListResourcesResult {
  resources: McpResource[];
  nextCursor?: string;
}

export type McpResourceContent =
  | {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
      annotations?: Record<string, unknown>;
    }
  | Record<string, unknown>;

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<Record<string, unknown>>;
}

export interface McpListPromptsResult {
  prompts: McpPrompt[];
  nextCursor?: string;
}

export interface McpGetPromptInput {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpPromptMessage {
  role: string;
  content: unknown;
}

export interface McpGetPromptResult {
  description?: string;
  messages: McpPromptMessage[];
}

export type McpContent =
  | { type: 'text'; text: string; annotations?: Record<string, unknown> }
  | {
      type: 'image';
      data?: string;
      mimeType?: string;
      annotations?: Record<string, unknown>;
    }
  | {
      type: 'audio';
      data?: string;
      mimeType?: string;
      annotations?: Record<string, unknown>;
    }
  | {
      type: 'resource_link';
      uri: string;
      name?: string;
      description?: string;
      mimeType?: string;
      annotations?: Record<string, unknown>;
    }
  | {
      type: 'resource';
      resource?: {
        uri?: string;
        text?: string;
        mimeType?: string;
      };
      annotations?: Record<string, unknown>;
    }
  | Record<string, unknown>;

export interface McpCallToolResult {
  content: McpContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface McpErrorOptions {
  status?: number;
  retryable?: boolean;
  cause?: unknown;
  rpcCode?: number;
}

/** MCP 调用相关的标准化错误，统一携带 HTTP 状态、RPC 错误码和重试信息。 */
export class McpError extends MiniHarnessError {
  readonly status?: number;
  readonly retryable: boolean;
  readonly rpcCode?: number;

  /** 创建 MCP 错误实例，用于 HTTP、网络、超时和 JSON-RPC 层错误。 */
  constructor(message: string, code: string, options: McpErrorOptions = {}) {
    super(message, code, options.cause);
    this.name = 'McpError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.rpcCode = options.rpcCode;
  }
}

/** 构造标准 JSON-RPC 2.0 请求对象，供 MCP HTTP 客户端发送。 */
export function createJsonRpcRequest(
  id: JsonRpcId,
  method: string,
  params?: Record<string, unknown>,
): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    ...(params ? { params } : {}),
  };
}

/** 构造标准 JSON-RPC 2.0 notification，不携带 id 且不要求服务端响应。 */
export function createJsonRpcNotification(
  method: string,
  params?: Record<string, unknown>,
): JsonRpcNotification {
  return {
    jsonrpc: '2.0',
    method,
    ...(params ? { params } : {}),
  };
}
