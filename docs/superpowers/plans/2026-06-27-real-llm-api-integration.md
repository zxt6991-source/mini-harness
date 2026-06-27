# 真实大模型 API 接入实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 让 MiniHarness 可以通过配置接入 DeepSeek 等真实 OpenAI-compatible Chat Completions API，同时保留现有 mock 和 OpenAI Responses API provider。

**架构：** 新增 `ChatCompletionsProvider` 与独立 parser，负责 `/chat/completions` 协议。新增配置 loader 与 provider factory，让 `src/main.ts` 从 `configs/harness.yaml` 创建真实 provider。`Engine`、memory、tools、MCP 主调用链保持不变。

**技术栈：** TypeScript、Vitest、Node.js fetch、yaml、zod、现有 `ModelProvider` 抽象。

---

## 文件结构

- Create: `src/models/chat-completions-parser.ts`  
  解析 Chat Completions 响应，输出内部 `ModelChatOutput`。
- Create: `src/models/chat-completions-provider.ts`  
  调用 OpenAI-compatible `/chat/completions`，映射消息、工具、错误与超时。
- Create: `src/models/provider-factory.ts`  
  根据配置创建 `MockProvider`、`OpenAIProvider`、`ChatCompletionsProvider`。
- Create: `src/utils/config.ts`  
  读取并校验 `configs/harness.yaml`。
- Create: `tests/chat-completions-parser.test.ts`  
  覆盖文本、工具调用、usage、非法工具参数、空输出。
- Create: `tests/chat-completions-provider.test.ts`  
  覆盖请求映射、auth、错误、超时/网络错误。
- Create: `tests/provider-factory.test.ts`  
  覆盖配置 loader 与 provider factory。
- Modify: `src/index.ts`  
  导出新模块。
- Modify: `src/main.ts`  
  使用配置 loader 和 provider factory。
- Modify: `src/tools/registry.ts`  
  在 tool message metadata 中保留 `toolCallId`。
- Modify: `configs/harness.yaml`  
  增加 `deepseek` provider 配置。
- Modify: `README.md`  
  增加 DeepSeek 运行说明。

## Task 1: Chat Completions Parser

**Files:**
- Create: `tests/chat-completions-parser.test.ts`
- Create: `src/models/chat-completions-parser.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { ModelProviderError } from '../src/core';
import { parseChatCompletionResponse } from '../src/models/chat-completions-parser';

describe('parseChatCompletionResponse', () => {
  it('parses assistant text and usage from chat completions responses', () => {
    const output = parseChatCompletionResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'hello',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
      },
    });

    expect(output.message).toMatchObject({
      role: 'assistant',
      content: 'hello',
    });
    expect(output.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
  });

  it('parses tool_calls into internal tool calls', () => {
    const output = parseChatCompletionResponse({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'echo',
                  arguments: '{"text":"hello"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    expect(output.message).toMatchObject({
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'echo',
          arguments: { text: 'hello' },
        },
      ],
    });
  });

  it('throws a model error when tool call arguments are invalid JSON', () => {
    expect(() =>
      parseChatCompletionResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'echo',
                    arguments: '{"text"',
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(ModelProviderError);
  });

  it('rejects empty model output through the quality gate', () => {
    expect(() =>
      parseChatCompletionResponse({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
            },
          },
        ],
      }),
    ).toThrow('Model returned an empty response');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/chat-completions-parser.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../src/models/chat-completions-parser'` 或 `parseChatCompletionResponse` 未定义。

- [ ] **Step 3: 写最小实现**

```ts
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

function parseToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => item as ChatCompletionToolCall)
    .filter((item) => item.type === 'function')
    .map((item) => ({
      id: item.id ?? createId('call'),
      name: typeof item.function?.name === 'string' ? item.function.name : '',
      arguments: parseToolArguments(item),
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
    ? typedResponse.choices.filter(isObject).map((choice) => choice as ChatCompletionChoice)
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/chat-completions-parser.test.ts`

Expected: PASS，4 tests pass。

## Task 2: Chat Completions Provider

**Files:**
- Create: `tests/chat-completions-provider.test.ts`
- Create: `src/models/chat-completions-provider.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ModelProviderError } from '../src/core';
import type { ChatCompletionsFetch } from '../src/models/chat-completions-provider';
import { ChatCompletionsProvider } from '../src/models/chat-completions-provider';
import { EchoTool } from '../src/tools/builtin/echo';

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

describe('ChatCompletionsProvider', () => {
  it('sends chat completion requests with messages, tools, options, and auth', async () => {
    const fetchFn = vi.fn<ChatCompletionsFetch>(async () =>
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
      }),
    );
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn,
    });

    await provider.chat({
      messages: [
        { id: 'msg_1', role: 'system', content: 'sys', createdAt: Date.now() },
        { id: 'msg_2', role: 'user', content: 'hello', createdAt: Date.now() },
        {
          id: 'msg_3',
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'echo', arguments: { text: 'hi' } }],
          createdAt: Date.now(),
        },
        { id: 'call_1', role: 'tool', content: 'hi', createdAt: Date.now() },
      ],
      tools: [new EchoTool()],
      options: { temperature: 0.2, maxTokens: 64, timeoutMs: 1_000 },
      metadata: { traceId: 'trace_1', sessionId: 'session_1' },
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'deepseek-test',
      temperature: 0.2,
      max_tokens: 64,
      stream: false,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'echo', arguments: '{"text":"hi"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'hi' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'echo',
            description: 'Return the input text directly.',
          },
        },
      ],
    });
  });

  it('normalizes missing API keys', async () => {
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: '',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn: vi.fn(),
    });

    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'DEEPSEEK_API_KEY_MISSING',
      retryable: false,
    });
  });

  it('normalizes retryable HTTP errors', async () => {
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn: vi.fn(async () =>
        jsonResponse({ error: { message: 'rate limited' } }, { ok: false, status: 429 }),
      ),
    });

    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'DEEPSEEK_HTTP_ERROR',
      status: 429,
      retryable: true,
    });
  });

  it('normalizes network errors', async () => {
    const provider = new ChatCompletionsProvider({
      name: 'deepseek',
      apiKey: 'test-key',
      model: 'deepseek-test',
      baseUrl: 'https://api.deepseek.com',
      fetchFn: vi.fn(async () => {
        throw new TypeError('network failed');
      }),
    });

    await expect(provider.chat({ messages: [] })).rejects.toBeInstanceOf(
      ModelProviderError,
    );
    await expect(provider.chat({ messages: [] })).rejects.toMatchObject({
      code: 'DEEPSEEK_NETWORK_ERROR',
      retryable: true,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/chat-completions-provider.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../src/models/chat-completions-provider'`。

- [ ] **Step 3: 写最小实现**

实现要点：

```ts
export class ChatCompletionsProvider implements ModelProvider {
  name: string;

  constructor(private readonly options: ChatCompletionsProviderOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
  }

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const apiKey = resolveApiKey(this.options.name, this.options.apiKey, this.options.apiKeyEnv);
    const timeoutMs = input.options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        throw new ModelProviderError(await readErrorMessage(response), `${this.errorPrefix}_HTTP_ERROR`, {
          status: response.status,
          retryable: isRetryableStatus(response.status),
        });
      }

      return parseChatCompletionResponse(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/chat-completions-provider.test.ts`

Expected: PASS，4 tests pass。

## Task 3: 配置 Loader 与 Provider Factory

**Files:**
- Create: `tests/provider-factory.test.ts`
- Create: `src/utils/config.ts`
- Create: `src/models/provider-factory.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ChatCompletionsProvider } from '../src/models/chat-completions-provider';
import { MockProvider } from '../src/models/mock-provider';
import { OpenAIProvider } from '../src/models/openai-provider';
import { createModelProvider } from '../src/models/provider-factory';
import { loadHarnessConfig } from '../src/utils/config';

describe('provider factory', () => {
  it('loads harness config defaults and creates mock providers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-config-'));
    const configPath = join(dir, 'harness.yaml');
    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
model:
  provider: mock
`,
    );

    const config = await loadHarnessConfig(configPath);
    expect(config.model.provider).toBe('mock');
    expect(createModelProvider(config)).toBeInstanceOf(MockProvider);
  });

  it('creates DeepSeek chat completions providers from config', () => {
    const provider = createModelProvider({
      runtime: { maxSteps: 4, requestTimeoutMs: 1000, enableStream: false },
      model: {
        provider: 'deepseek',
        temperature: 0.2,
        maxTokens: 64,
        openai: {
          model: 'gpt-test',
          apiKeyEnv: 'OPENAI_API_KEY',
          baseUrl: 'https://api.openai.com/v1',
        },
        deepseek: {
          model: 'deepseek-test',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    });

    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('creates OpenAI providers from config', () => {
    const provider = createModelProvider({
      runtime: { maxSteps: 4, requestTimeoutMs: 1000, enableStream: false },
      model: {
        provider: 'openai',
        temperature: 0.2,
        maxTokens: 64,
        openai: {
          model: 'gpt-test',
          apiKeyEnv: 'OPENAI_API_KEY',
          baseUrl: 'https://api.openai.com/v1',
        },
        deepseek: {
          model: 'deepseek-test',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/provider-factory.test.ts`

Expected: FAIL，错误包含 `Cannot find module '../src/models/provider-factory'` 或 `Cannot find module '../src/utils/config'`。

- [ ] **Step 3: 写最小实现**

`src/utils/config.ts` 要导出：

```ts
export interface HarnessConfig {
  runtime: {
    maxSteps: number;
    requestTimeoutMs: number;
    enableStream: boolean;
  };
  model: {
    provider: 'mock' | 'openai' | 'deepseek';
    temperature?: number;
    maxTokens?: number;
    openai: ProviderConfig;
    deepseek: ProviderConfig;
  };
}

export async function loadHarnessConfig(path = 'configs/harness.yaml'): Promise<HarnessConfig> {
  const raw = await readFile(path, 'utf8');
  return harnessConfigSchema.parse(parse(raw));
}
```

`src/models/provider-factory.ts` 要导出：

```ts
export function createModelProvider(config: HarnessConfig): ModelProvider {
  switch (config.model.provider) {
    case 'mock':
      return new MockProvider();
    case 'openai':
      return new OpenAIProvider({
        model: config.model.openai.model,
        baseUrl: config.model.openai.baseUrl,
        apiKey: process.env[config.model.openai.apiKeyEnv],
        defaultTimeoutMs: config.runtime.requestTimeoutMs,
      });
    case 'deepseek':
      return new ChatCompletionsProvider({
        name: 'deepseek',
        model: config.model.deepseek.model,
        baseUrl: config.model.deepseek.baseUrl,
        apiKey: process.env[config.model.deepseek.apiKeyEnv],
        defaultTimeoutMs: config.runtime.requestTimeoutMs,
      });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/provider-factory.test.ts`

Expected: PASS，3 tests pass。

## Task 4: 接入入口、导出、配置和文档

**Files:**
- Modify: `src/index.ts`
- Modify: `src/main.ts`
- Modify: `src/tools/registry.ts`
- Modify: `configs/harness.yaml`
- Modify: `README.md`

- [ ] **Step 1: 写失败测试**

在 `tests/tool.test.ts` 增加：

```ts
it('preserves tool call ids in tool message metadata', async () => {
  const registry = new DefaultToolRegistry();
  registry.register(new EchoTool());

  const result = await registry.execute(
    { id: 'call_1', name: 'echo', arguments: { text: 'ok' } },
    { traceId: 'trace_1', sessionId: 'session_1' },
  );

  expect(result).toMatchObject({
    id: 'call_1',
    role: 'tool',
    metadata: {
      toolCallId: 'call_1',
      toolName: 'echo',
      success: true,
    },
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/tool.test.ts`

Expected: FAIL，错误显示 `metadata.toolCallId` 缺失。

- [ ] **Step 3: 写最小实现并接线**

`src/tools/registry.ts` metadata 增加：

```ts
metadata: {
  toolCallId: toolCall.id,
  toolName: tool.name,
  success: result.success,
  ...result.metadata,
},
```

`src/main.ts` 改为：

```ts
import { loadHarnessConfig } from './utils/config';
import { createModelProvider } from './models/provider-factory';
```

并在 `main()` 中使用：

```ts
const config = await loadHarnessConfig();
const model = createModelProvider(config);
```

`src/index.ts` 增加导出：

```ts
export * from './models/chat-completions-provider';
export * from './models/chat-completions-parser';
export * from './models/provider-factory';
export * from './utils/config';
```

`configs/harness.yaml` 增加：

```yaml
  deepseek:
    model: deepseek-v4-flash
    apiKeyEnv: DEEPSEEK_API_KEY
    baseUrl: https://api.deepseek.com
```

`README.md` 增加 DeepSeek 示例：

```md
## DeepSeek Provider

Set `model.provider: deepseek` in `configs/harness.yaml`, then run:

```bash
export DEEPSEEK_API_KEY=sk-<redacted>
pnpm dev
```
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/tool.test.ts tests/provider-factory.test.ts`

Expected: PASS，相关测试全部通过。

## Task 5: 全量验证

**Files:**
- No production file changes unless verification reveals a defect.

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`

Expected: PASS，exit code 0。

- [ ] **Step 2: 单元测试**

Run: `pnpm test`

Expected: PASS，所有 test files 和 tests 通过。

- [ ] **Step 3: 构建**

Run: `pnpm build`

Expected: PASS，生成 dist，无 TypeScript 或打包错误。

- [ ] **Step 4: 手动 smoke test mock 模式**

Run: `pnpm dev`

Expected: 输出以 `Mock response:` 开头，证明默认配置仍不需要真实 API key。

## 自检

- Spec coverage: parser、provider、配置工厂、入口接线、工具调用 id、README、验证命令都有对应任务。
- Placeholder scan: 本计划没有 `TBD`、`TODO` 或“补充适当处理”式占位步骤。
- Type consistency: `ChatCompletionsProvider`、`parseChatCompletionResponse`、`HarnessConfig`、`createModelProvider` 命名在任务间保持一致。
