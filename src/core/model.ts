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
}

export interface ModelOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelStreamEvent {
  type: 'text_delta' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  error?: Error;
}
