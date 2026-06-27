import type { ModelChatOutput, TokenUsage, ToolCall } from '../core';
import { ModelProviderError } from '../core';
import { createId } from '../utils/id';
import { ensureModelOutput } from './quality-gate';

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ChatCompletionToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

interface ChatCompletionChoice {
  message?: {
    role?: string;
    content?: unknown;
    tool_calls?: unknown;
  };
}

interface ChatCompletionResponse {
  choices?: unknown;
  usage?: ChatCompletionUsage;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseUsage(usage: ChatCompletionUsage | undefined): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens:
      usage.total_tokens ??
      (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
  };
}

function parseToolArguments(toolCall: ChatCompletionToolCall): Record<string, unknown> {
  if (typeof toolCall.function?.arguments !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments) as unknown;

    if (!isObject(parsed)) {
      throw new Error('Tool call arguments must be an object');
    }

    return parsed;
  } catch (error) {
    throw new ModelProviderError(
      `Invalid tool_call arguments for ${String(toolCall.function?.name ?? 'unknown tool')}`,
      'MODEL_TOOL_ARGUMENTS_INVALID',
      { retryable: false, cause: error },
    );
  }
}

function parseToolCalls(toolCalls: unknown): ToolCall[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls
    .filter(isObject)
    .map((toolCall) => toolCall as ChatCompletionToolCall)
    .filter((toolCall) => toolCall.type === 'function')
    .map((toolCall) => ({
      id: toolCall.id ?? createId('call'),
      name: typeof toolCall.function?.name === 'string' ? toolCall.function.name : '',
      arguments: parseToolArguments(toolCall),
    }));
}

export function parseChatCompletionResponse(response: unknown): ModelChatOutput {
  if (!isObject(response)) {
    throw new ModelProviderError(
      'Chat completion response was not an object',
      'MODEL_RESPONSE_INVALID',
      { retryable: true },
    );
  }

  const typedResponse = response as ChatCompletionResponse;
  const choices = Array.isArray(typedResponse.choices)
    ? typedResponse.choices
        .filter(isObject)
        .map((choice) => choice as ChatCompletionChoice)
    : [];
  const message = choices[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  const toolCalls = parseToolCalls(message?.tool_calls);

  return ensureModelOutput({
    message: {
      id: createId('msg'),
      role: 'assistant',
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      createdAt: Date.now(),
    },
    usage: parseUsage(typedResponse.usage),
  });
}
