// 该文件解析 Chat Completions 返回值，将 assistant 内容、工具调用和 token 用量归一化。
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

/** 判断未知值是否为非空对象，便于安全解析第三方响应。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 将 Chat Completions usage 字段转换为内部 token 用量结构。 */
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

/** 解析单个 Chat Completions 工具调用参数，并要求参数 JSON 为对象。 */
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

/** 从 Chat Completions 的 tool_calls 字段中提取内部工具调用列表。 */
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

/** 将 Chat Completions 原始响应解析为内部统一的模型输出。 */
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
