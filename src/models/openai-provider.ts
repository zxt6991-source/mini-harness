// 该文件实现基于 OpenAI Responses API 的模型提供方，包含请求构造、超时和错误处理。
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
  Tool,
} from '../core';
import { ModelProviderError } from '../core';
import { logger } from '../reliability/logger';
import { parseOpenAIResponse } from './parser';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type OpenAIFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export interface OpenAIProviderOptions {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  fetchFn?: OpenAIFetch;
  defaultTimeoutMs?: number;
}

/** 调用运行时内置 fetch，作为 OpenAI 请求的默认 HTTP 实现。 */
function defaultFetch(url: string, init: Parameters<OpenAIFetch>[1]) {
  return fetch(url, init);
}

/** 从显式参数或 OPENAI_API_KEY 环境变量中解析 OpenAI API Key。 */
function resolveApiKey(apiKey: string | undefined): string {
  const resolved = apiKey ?? process.env.OPENAI_API_KEY;

  if (!resolved) {
    throw new ModelProviderError(
      'OPENAI_API_KEY is required to use OpenAIProvider',
      'OPENAI_API_KEY_MISSING',
      { retryable: false },
    );
  }

  return resolved;
}

/** 判断 HTTP 状态码是否适合由上层进行重试。 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** 从 OpenAI 错误响应中尽量提取可读错误消息。 */
async function readErrorMessage(response: FetchResponseLike): Promise<string> {
  try {
    const body = (await response.json()) as unknown;
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
    ) {
      return (body as { error: { message: string } }).error.message;
    }
  } catch {
    // Fall back to text below.
  }

  try {
    return await response.text();
  } catch {
    return `OpenAI request failed with status ${response.status}`;
  }
}

/** 将内部消息转换为 OpenAI Responses API 接受的 input 项。 */
function toOpenAIInput(message: Message): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      type: 'function_call_output',
      call_id: message.id,
      output: message.content,
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

/** 将内部工具定义转换为 OpenAI Responses API 的 function 工具格式。 */
function toOpenAITool(tool: Tool): Record<string, unknown> {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.schema,
  };
}

/** 根据模型名称、消息和工具定义组装 OpenAI Responses API 请求体。 */
function buildRequestBody(model: string, input: ModelChatInput): Record<string, unknown> {
  return {
    model,
    input: input.messages.map(toOpenAIInput),
    tools: input.tools?.map(toOpenAITool),
    temperature: input.options?.temperature,
    max_output_tokens: input.options?.maxTokens,
  };
}

/** OpenAI Responses API 模型提供方，负责请求发送、超时控制和响应解析。 */
export class OpenAIProvider implements ModelProvider {
  name = 'openai';

  private readonly baseUrl: string;
  private readonly fetchFn: OpenAIFetch;
  private readonly defaultTimeoutMs: number;

  /** 初始化 OpenAI 访问配置，包括 baseUrl、fetch 实现和默认超时时间。 */
  constructor(private readonly options: OpenAIProviderOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  }

  /** 调用 OpenAI Responses API 并返回归一化后的模型输出。 */
  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const apiKey = resolveApiKey(this.options.apiKey);
    const timeoutMs = input.options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetchFn(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildRequestBody(this.options.model, input)),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ModelProviderError(
          await readErrorMessage(response),
          'OPENAI_HTTP_ERROR',
          {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      const body = await response.json();
      return parseOpenAIResponse(body);
    } catch (error) {
      if (error instanceof ModelProviderError) {
        this.logFailure(input, error, startedAt);
        throw error;
      }

      const normalized =
        error instanceof Error && error.name === 'AbortError'
          ? new ModelProviderError('OpenAI request timed out', 'OPENAI_TIMEOUT', {
              retryable: true,
              cause: error,
            })
          : new ModelProviderError('OpenAI network request failed', 'OPENAI_NETWORK_ERROR', {
              retryable: true,
              cause: error,
            });

      this.logFailure(input, normalized, startedAt);
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 记录 OpenAI 请求失败的追踪信息，便于按会话和 trace 定位问题。 */
  private logFailure(
    input: ModelChatInput,
    error: ModelProviderError,
    startedAt: number,
  ): void {
    logger.error({
      traceId: input.metadata?.traceId,
      sessionId: input.metadata?.sessionId,
      modelName: this.options.model,
      latencyMs: Date.now() - startedAt,
      errorCode: error.code,
      status: error.status,
      retryable: error.retryable,
    });
  }
}
