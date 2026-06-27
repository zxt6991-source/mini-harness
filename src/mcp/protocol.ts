import { MiniHarnessError } from '../core';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
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

export class McpError extends MiniHarnessError {
  readonly status?: number;
  readonly retryable: boolean;
  readonly rpcCode?: number;

  constructor(message: string, code: string, options: McpErrorOptions = {}) {
    super(message, code, options.cause);
    this.name = 'McpError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.rpcCode = options.rpcCode;
  }
}

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
