import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
  Tool,
} from '../core';
import { ModelProviderError } from '../core';
import { logger } from '../reliability/logger';
import { parseChatCompletionResponse } from './chat-completions-parser';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type ChatCompletionsFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<FetchResponseLike>;

export interface ChatCompletionsProviderOptions {
  name: string;
  apiKey?: string;
  apiKeyEnv?: string;
  model: string;
  baseUrl: string;
  fetchFn?: ChatCompletionsFetch;
  defaultTimeoutMs?: number;
}

function defaultFetch(url: string, init: Parameters<ChatCompletionsFetch>[1]) {
  return fetch(url, init);
}

function errorPrefix(providerName: string): string {
  return providerName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function resolveApiKey(
  providerName: string,
  apiKey: string | undefined,
  apiKeyEnv: string | undefined,
): string {
  const envName = apiKeyEnv ?? `${errorPrefix(providerName)}_API_KEY`;
  const resolved = apiKey ?? process.env[envName];

  if (!resolved) {
    throw new ModelProviderError(
      `${envName} is required to use ${providerName}`,
      `${errorPrefix(providerName)}_API_KEY_MISSING`,
      { retryable: false },
    );
  }

  return resolved;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

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
    return `Chat completion request failed with status ${response.status}`;
  }
}

function toChatToolCall(toolCall: NonNullable<Message['toolCalls']>[number]) {
  return {
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.arguments),
    },
  };
}

function toChatMessage(message: Message): Record<string, unknown> {
  if (message.role === 'tool') {
    const toolCallId =
      typeof message.metadata?.toolCallId === 'string'
        ? message.metadata.toolCallId
        : message.id;

    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content: message.content,
    };
  }

  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map(toChatToolCall),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function toChatTool(tool: Tool): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  };
}

function buildRequestBody(model: string, input: ModelChatInput): Record<string, unknown> {
  return {
    model,
    messages: input.messages.map(toChatMessage),
    tools: input.tools?.length ? input.tools.map(toChatTool) : undefined,
    temperature: input.options?.temperature,
    max_tokens: input.options?.maxTokens,
    stream: false,
  };
}

export class ChatCompletionsProvider implements ModelProvider {
  name: string;

  private readonly baseUrl: string;
  private readonly fetchFn: ChatCompletionsFetch;
  private readonly defaultTimeoutMs: number;
  private readonly errorPrefix: string;

  constructor(private readonly options: ChatCompletionsProviderOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
    this.errorPrefix = errorPrefix(options.name);
  }

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const apiKey = resolveApiKey(
      this.options.name,
      this.options.apiKey,
      this.options.apiKeyEnv,
    );
    const timeoutMs = input.options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
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
          `${this.errorPrefix}_HTTP_ERROR`,
          {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      return parseChatCompletionResponse(await response.json());
    } catch (error) {
      if (error instanceof ModelProviderError) {
        this.logFailure(input, error, startedAt);
        throw error;
      }

      const normalized =
        error instanceof Error && error.name === 'AbortError'
          ? new ModelProviderError(
              `${this.options.name} request timed out`,
              `${this.errorPrefix}_TIMEOUT`,
              {
                retryable: true,
                cause: error,
              },
            )
          : new ModelProviderError(
              `${this.options.name} network request failed`,
              `${this.errorPrefix}_NETWORK_ERROR`,
              {
                retryable: true,
                cause: error,
              },
            );

      this.logFailure(input, normalized, startedAt);
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  private logFailure(
    input: ModelChatInput,
    error: ModelProviderError,
    startedAt: number,
  ): void {
    logger.error({
      traceId: input.metadata?.traceId,
      sessionId: input.metadata?.sessionId,
      providerName: this.options.name,
      modelName: this.options.model,
      latencyMs: Date.now() - startedAt,
      errorCode: error.code,
      status: error.status,
      retryable: error.retryable,
    });
  }
}
