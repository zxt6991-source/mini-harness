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
