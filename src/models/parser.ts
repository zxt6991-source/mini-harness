// 该文件解析 OpenAI Responses API 返回值，将文本、工具调用和用量转换为内部模型输出。
import type { ModelChatOutput, ToolCall, TokenUsage } from '../core';
import { ModelProviderError } from '../core';
import { createId } from '../utils/id';
import { ensureModelOutput } from './quality-gate';

interface ResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface ResponseContentPart {
  type?: string;
  text?: unknown;
}

interface ResponseOutputItem {
  id?: string;
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: unknown;
  content?: unknown;
}

interface ResponsesApiResponse {
  output?: unknown;
  usage?: ResponseUsage;
}

/** 判断未知值是否为非空对象，便于安全访问响应字段。 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 从 Responses API 响应中提取 output 数组项。 */
function asOutputItems(response: ResponsesApiResponse): ResponseOutputItem[] {
  return Array.isArray(response.output)
    ? response.output.filter(isObject).map((item) => item as ResponseOutputItem)
    : [];
}

/** 从消息内容片段中抽取文本输出。 */
function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(isObject)
    .map((part) => part as ResponseContentPart)
    .filter((part) => part.type === 'output_text' || part.type === 'text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

/** 解析工具调用参数 JSON，并在参数格式非法时抛出模型错误。 */
function parseToolArguments(item: ResponseOutputItem): Record<string, unknown> {
  if (typeof item.arguments !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(item.arguments) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    throw new ModelProviderError(
      `Invalid tool_call arguments for ${item.name ?? 'unknown tool'}`,
      'MODEL_TOOL_ARGUMENTS_INVALID',
      { retryable: false, cause: error },
    );
  }
}

/** 将 OpenAI usage 字段转换为内部 token 用量结构。 */
function parseUsage(usage: ResponseUsage | undefined): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    totalTokens:
      usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
  };
}

/** 将 OpenAI Responses API 的原始响应解析为内部统一的模型输出。 */
export function parseOpenAIResponse(response: unknown): ModelChatOutput {
  if (!isObject(response)) {
    throw new ModelProviderError(
      'OpenAI response was not an object',
      'MODEL_RESPONSE_INVALID',
      { retryable: true },
    );
  }

  const typedResponse = response as ResponsesApiResponse;
  const outputItems = asOutputItems(typedResponse);
  const content = outputItems
    .filter((item) => item.type === 'message' && item.role === 'assistant')
    .map((item) => extractText(item.content))
    .join('');

  const toolCalls: ToolCall[] = outputItems
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      id: item.call_id ?? item.id ?? createId('call'),
      name: item.name ?? '',
      arguments: parseToolArguments(item),
    }));

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
