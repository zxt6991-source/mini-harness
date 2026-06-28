// 该文件定义模型提供方接口，以及聊天输入输出、流式事件和 token 用量等核心类型。
import type { Message, ToolCall } from './message';
import type { Tool } from './tool';

export interface ModelProvider {
  name: string;
  chat(input: ModelChatInput): Promise<ModelChatOutput>;
  stream?(input: ModelChatInput): AsyncIterable<ModelStreamEvent>;
}

export interface ModelChatInput {
  messages: Message[];
  tools?: Tool[];
  options?: ModelOptions;
  metadata?: Record<string, unknown>;
}

export interface ModelChatOutput {
  message: Message;
  usage?: TokenUsage;
  metadata?: Record<string, unknown>;
}

export interface ModelOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  reasoning?: ReasoningOptions;
}

export interface ReasoningOptions {
  strategy: 'disabled' | 'adaptive' | 'budget_based' | 'required';
  effort?: 'low' | 'medium' | 'high' | 'max';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export interface ModelStreamEvent {
  type: 'text_delta' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  error?: Error;
}
