// 该文件定义工具、工具结果、执行上下文和工具注册表接口，供模型调用外部能力。
import type { Message, ToolCall } from './message';

export interface ToolResult {
  success: boolean;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ToolContext {
  traceId: string;
  sessionId: string;
  abortSignal?: AbortSignal;
}

export interface Tool {
  name: string;
  description: string;
  schema: unknown;
  call(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  execute(toolCall: ToolCall, ctx: ToolContext): Promise<Message>;
}
