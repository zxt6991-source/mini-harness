# MiniHarness TypeScript 实现步骤文档

> 本文档基于 `MiniHarness_TS_技术方案(2).md` 整理，目标是把技术方案拆解成可以直接执行的开发步骤。

## 当前开发标注

| 内容 | 状态 | 落地文件 / 验证 |
|---|---|---|
| 3.1 创建项目 | 已完成 | 当前目录已作为 `miniharness` 工程根目录 |
| 3.2 安装依赖 | 已完成 | `pnpm install` 成功，已生成 `pnpm-lock.yaml` |
| 3.3 初始化 TypeScript 配置 | 已完成 | `tsconfig.json` 已启用 strict TypeScript；当前使用 `ESNext` + `Bundler` 解析以匹配本项目 ESM 测试和打包 |
| 3.4 配置 `package.json` | 已完成 | 已配置 `dev`、`build`、`test`、`typecheck` 脚本 |
| 4 创建目录结构 | 已完成 | 已创建 `src/`、`configs/`、`examples/`、`tests/` |
| 5.1 `src/core/message.ts` | 已完成 | `tests/core.test.ts` 覆盖核心类型相关导出 |
| 5.2 `src/core/tool.ts` | 已完成 | `tests/tool.test.ts` 覆盖工具接口实现路径 |
| 5.3 `src/core/model.ts` | 已完成 | `tests/mock-provider.test.ts` 和 `tests/runtime.test.ts` 覆盖 Provider 调用 |
| 5.4 `src/core/memory.ts` | 已完成 | `tests/memory.test.ts` 覆盖 Memory 接口实现 |
| 5.5 `src/core/errors.ts` | 已完成 | `tests/core.test.ts` 覆盖错误 code |
| 5.6 `src/core/index.ts` | 已完成 | 测试通过 `../src/core` 聚合导入 |
| 6.1 `src/utils/id.ts` | 已完成 | `tests/core.test.ts` 覆盖 ID 前缀 |
| 7.1 `src/memory/local-store.ts` | 已完成 | `tests/memory.test.ts` 覆盖保存、读取、搜索、上下文组装 |
| 8.1 `src/models/mock-provider.ts` | 已完成 | `tests/mock-provider.test.ts` 覆盖 Mock assistant 输出 |
| 9.1 `src/tools/registry.ts` | 已完成 | `tests/tool.test.ts` 覆盖注册、查找、重复注册、执行、未知工具 |
| 10.1 `src/runtime/engine.ts` | 已完成 | `tests/runtime.test.ts` 覆盖普通输出、工具调用循环、未知工具、maxSteps |
| 11.1 `src/main.ts` | 已完成 | `pnpm dev` 用于验证默认入口输出 |
| 11.2 `src/index.ts` | 已完成 | `pnpm build` 用于验证统一导出和声明文件 |
| 12 第一阶段验收 | 已完成 | `pnpm test`、`pnpm dev` 验证 |
| 13.1 `src/tools/builtin/echo.ts` | 已完成 | `tests/tool.test.ts` 覆盖 EchoTool |
| 14.1 `src/security/policy.ts` | 已完成 | `tests/security.test.ts` 使用策略对象验证 |
| 14.2 `src/security/path.ts` | 已完成 | `tests/security.test.ts` 覆盖沙箱内、根目录、越权路径 |
| 14.3 `src/security/guard.ts` | 已完成 | `tests/security.test.ts` 覆盖 allow/deny 规则 |
| 15.1 `src/reliability/logger.ts` | 已完成 | `tests/tool.test.ts` 执行 ToolExecutor 时产生结构化日志 |
| 16.1 `src/tools/executor.ts` | 已完成 | `tests/tool.test.ts` 覆盖权限检查、成功执行，并验证 Registry 可注入 ToolExecutor |
| 17 第二阶段验收 | 已完成（MVP 范围） | EchoTool、SecurityGuard、ToolExecutor、logger 均有测试；文件/HTTP/Shell 工具未纳入本轮 MVP |
| 18 OpenAIProvider | 已完成 | 已实现 `src/models/openai-provider.ts`、`src/models/parser.ts`、`src/models/quality-gate.ts`；测试使用 mock fetch，真实调用读取 `OPENAI_API_KEY` |
| 19 Memory 增强 | 部分完成 | 已实现 `src/memory/context-builder.ts`、`src/memory/summarizer.ts`、最近 N 轮、关键词相关历史、摘要、字符裁剪、多 session 隔离；`sqlite-store.ts` 后续增强 |
| 20 第三阶段验收 | 已完成（SQLite 除外） | 普通文本、tool_call、Engine 工具循环、上下文组装、模型错误归一化、错误日志字段均有测试覆盖 |
| 21 MCP 实现目标 | 已完成 | 已实现 HTTP MCP 工具发现 -> Adapter 转换 -> Registry 注册 -> Engine 调用链路 |
| 22 MCP 建议文件 | 已完成 | 已实现 `src/mcp/protocol.ts`、`src/mcp/client.ts`、`src/mcp/discovery.ts`、`src/mcp/adapter.ts` |
| 23 McpToolAdapter | 已完成 | `tests/mcp-adapter.test.ts` 覆盖 text/image/resource 内容规整和 `isError` 处理 |
| 24 第四阶段验收 | 已完成（HTTP 范围） | `tests/mcp-client.test.ts`、`tests/mcp-discovery.test.ts`、`tests/runtime.test.ts` 覆盖配置式 HTTP endpoint、工具发现、Adapter、Registry、Engine 调用和错误归一化；stdio、SSE、初始化/session 生命周期后续增强 |
| 25 编排模块目标 | 已完成 | 已实现本地可测编排核心，可用于代码审查、测试生成、文档生成、多工具组合和多角色任务协作的任务层抽象 |
| 26 任务结构 | 已完成 | 已实现 `src/orchestration/task.ts`、`planner.ts`、`state-machine.ts`、`coordinator.ts`、`graph.ts` |
| 27 第五阶段验收 | 已完成（本地 handler 范围） | `tests/orchestration.test.ts` 覆盖任务拆解、状态流转、dependsOn、失败重试/降级、多 role handler；真实多进程/网络 Agent 和持久化状态后续增强 |

最终验证（2026-06-19）：

```text
pnpm test      -> 6 files passed, 26 tests passed
pnpm typecheck -> passed
pnpm build     -> passed
pnpm dev       -> Mock response: 帮我分析一下当前项目结构
```

第三阶段验证（2026-06-22）：

```text
pnpm test      -> 9 files passed, 43 tests passed
pnpm typecheck -> passed
pnpm build     -> passed
pnpm dev       -> Mock response: 帮我分析一下当前项目结构
```

第四阶段验证（2026-06-22）：

```text
pnpm test      -> 12 files passed, 56 tests passed
pnpm typecheck -> passed
pnpm build     -> passed
pnpm dev       -> Mock response: 帮我分析一下当前项目结构
```

第五阶段验证（2026-06-23）：

```text
pnpm test      -> 13 files passed, 68 tests passed
pnpm typecheck -> passed
pnpm build     -> passed
pnpm dev       -> Mock response: 帮我分析一下当前项目结构
```

---

## 1. 实现目标

MiniHarness 第一版不追求一次性完成完整 Agent Harness，而是先跑通最小闭环：

```text
用户输入
  -> Runtime Engine
  -> Memory 组装上下文
  -> ModelProvider 调用模型
  -> 返回 Assistant 消息
  -> 保存会话
```

后续再逐步扩展：

```text
工具调用
  -> 参数校验
  -> 安全控制
  -> 日志追踪
  -> 真实模型
  -> MCP 工具接入
  -> 多任务编排
```

---

## 2. 总体实现阶段

| 阶段 | 目标 | 主要模块 | 结果 |
|---|---|---|---|
| 第一阶段 | 跑通最小 Harness | `core/`、`runtime/`、`memory/`、`models/`、`tools/` | 可以输入并返回 Mock 响应 |
| 第二阶段 | 工具系统、安全、日志 | `tools/`、`security/`、`reliability/` | 工具可注册、可执行、可拦截、可追踪 |
| 第三阶段 | 接入真实模型和 Memory 增强 | `models/`、`memory/` | 支持真实模型和上下文管理 |
| 第四阶段 | 接入 MCP | `mcp/`、`tools/` | MCP 工具可被 Harness 调用 |
| 第五阶段 | 任务编排 | `orchestration/` | 支持复杂任务拆解和多 Agent 协作 |

---

# 第一阶段：最小 Harness 骨架

## 3. 初始化工程

### 3.1 创建项目

```bash
mkdir MiniHarness
cd MiniHarness
pnpm init
```

### 3.2 安装依赖

```bash
pnpm add nanoid pino yaml zod undici
pnpm add -D typescript tsx tsup vitest @types/node
```

依赖说明：

| 依赖 | 用途 |
|---|---|
| `nanoid` | 生成 message_id、trace_id、session_id |
| `pino` | 结构化日志 |
| `yaml` | 读取 YAML 配置 |
| `zod` | 参数 Schema 校验、配置校验 |
| `undici` | HTTP 请求 |
| `tsx` | 直接运行 TypeScript |
| `tsup` | 打包 TypeScript 项目 |
| `vitest` | 单元测试 |

### 3.3 初始化 TypeScript 配置

```bash
pnpm tsc --init
```

建议 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

### 3.4 配置 `package.json`

```json
{
  "name": "miniharness",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "nanoid": "^5.0.0",
    "pino": "^9.0.0",
    "undici": "^7.0.0",
    "yaml": "^2.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^3.0.0"
  }
}
```

---

## 4. 创建目录结构

```bash
mkdir -p src/core
mkdir -p src/runtime
mkdir -p src/tools/builtin
mkdir -p src/memory
mkdir -p src/models
mkdir -p src/security
mkdir -p src/reliability
mkdir -p src/mcp
mkdir -p src/orchestration
mkdir -p src/utils
mkdir -p configs
mkdir -p tests
mkdir -p examples/simple-agent
mkdir -p examples/tool-call
mkdir -p examples/mcp-demo
```

第一阶段优先实现：

```text
src/core/message.ts
src/core/tool.ts
src/core/model.ts
src/core/memory.ts
src/core/errors.ts
src/core/index.ts

src/utils/id.ts

src/memory/local-store.ts
src/models/mock-provider.ts
src/tools/registry.ts
src/runtime/engine.ts

src/main.ts
src/index.ts
```

---

## 5. 实现 `core/` 基础类型

`core/` 只定义基础类型、接口、错误类型，不依赖具体实现。

依赖方向应保持：

```text
runtime -> core
models  -> core
tools   -> core
memory  -> core
mcp     -> core
```

不要让 `core/` 反向依赖 `runtime/`、`models/`、`mcp/`。

---

### 5.1 `src/core/message.ts`

```ts
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}
```

TypeScript 说明：

```ts
export type Role = 'system' | 'user' | 'assistant' | 'tool';
```

表示 `Role` 只能是这几个固定字符串，类似 Go 里定义一组固定枚举值。

```ts
Record<string, unknown>
```

类似 Go 中的：

```go
map[string]interface{}
```

区别是 `unknown` 比 `any` 更安全，使用前需要先判断类型。

---

### 5.2 `src/core/tool.ts`

```ts
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
```

设计说明：

所有工具都实现统一的 `Tool` 接口。无论是本地工具、MCP 工具、业务自定义工具，最终都注册到 `ToolRegistry` 中。

---

### 5.3 `src/core/model.ts`

```ts
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
```

设计说明：

`runtime/engine.ts` 只依赖 `ModelProvider`，不直接依赖 OpenAI、Claude、Gemini 等具体厂商。

---

### 5.4 `src/core/memory.ts`

```ts
import type { Message } from './message';

export interface Memory {
  save(sessionId: string, message: Message): Promise<void>;

  loadRecent(sessionId: string, limit: number): Promise<Message[]>;

  search(sessionId: string, query: string, topK: number): Promise<Message[]>;

  buildContext(sessionId: string, input: Message): Promise<Message[]>;
}
```

---

### 5.5 `src/core/errors.ts`

```ts
export class MiniHarnessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MiniHarnessError';
  }
}

export class ToolNotFoundError extends MiniHarnessError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND');
  }
}

export class MaxStepsExceededError extends MiniHarnessError {
  constructor(maxSteps: number) {
    super(`Agent loop exceeded maxSteps=${maxSteps}`, 'MAX_STEPS_EXCEEDED');
  }
}
```

---

### 5.6 `src/core/index.ts`

```ts
export * from './message';
export * from './tool';
export * from './model';
export * from './memory';
export * from './errors';
```

---

## 6. 实现基础工具函数

### 6.1 `src/utils/id.ts`

```ts
import { nanoid } from 'nanoid';

export function createId(prefix = 'id'): string {
  return `${prefix}_${nanoid(12)}`;
}
```

说明：

`prefix = 'id'` 是 TypeScript 的默认参数写法，类似 Go 中手动判断空值后设置默认值。

---

## 7. 实现本地 Memory

### 7.1 `src/memory/local-store.ts`

```ts
import type { Memory, Message } from '../core';
import { createId } from '../utils/id';

function createSystemMessage(content: string): Message {
  return {
    id: createId('msg'),
    role: 'system',
    content,
    createdAt: Date.now(),
  };
}

export class InMemoryStore implements Memory {
  private readonly sessions = new Map<string, Message[]>();

  async save(sessionId: string, message: Message): Promise<void> {
    const messages = this.sessions.get(sessionId) ?? [];
    messages.push(message);
    this.sessions.set(sessionId, messages);
  }

  async loadRecent(sessionId: string, limit: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) ?? [];
    return messages.slice(-limit);
  }

  async search(sessionId: string, query: string, topK: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) ?? [];

    return messages
      .filter((message) => message.content.includes(query))
      .slice(0, topK);
  }

  async buildContext(sessionId: string, input: Message): Promise<Message[]> {
    const recent = await this.loadRecent(sessionId, 20);

    return [
      createSystemMessage('You are MiniHarness Agent.'),
      ...recent,
      input,
    ];
  }
}
```

说明：

```ts
private readonly sessions = new Map<string, Message[]>();
```

类似 Go 中：

```go
map[string][]Message
```

这里用于按 `sessionId` 保存不同会话的消息列表。

---

## 8. 实现 MockProvider

### 8.1 `src/models/mock-provider.ts`

```ts
import type {
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../core';
import { createId } from '../utils/id';

export class MockProvider implements ModelProvider {
  name = 'mock';

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const lastMessage = input.messages.at(-1);

    return {
      message: {
        id: createId('msg'),
        role: 'assistant',
        content: `Mock response: ${lastMessage?.content ?? ''}`,
        createdAt: Date.now(),
      },
    };
  }
}
```

第一阶段先不要接真实大模型。先用 `MockProvider` 验证框架主链路，避免一开始就把框架问题、网络问题、模型 API 问题混在一起。

---

## 9. 实现工具注册中心

### 9.1 `src/tools/registry.ts`

```ts
import type {
  Message,
  Tool,
  ToolCall,
  ToolContext,
  ToolRegistry,
} from '../core';
import { ToolNotFoundError } from '../core';

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<Message> {
    const tool = this.get(toolCall.name);

    if (!tool) {
      throw new ToolNotFoundError(toolCall.name);
    }

    const result = await tool.call(toolCall.arguments, ctx);

    return {
      id: toolCall.id,
      role: 'tool',
      content: result.content,
      createdAt: Date.now(),
      metadata: {
        toolName: tool.name,
        success: result.success,
        ...result.metadata,
      },
    };
  }
}
```

---

## 10. 实现 Runtime Engine

### 10.1 `src/runtime/engine.ts`

```ts
import type {
  Memory,
  Message,
  ModelProvider,
  ToolRegistry,
} from '../core';
import { MaxStepsExceededError } from '../core';
import { createId } from '../utils/id';

export interface EngineOptions {
  maxSteps: number;
  requestTimeoutMs: number;
  enableStream: boolean;
}

function createUserMessage(input: string): Message {
  return {
    id: createId('msg'),
    role: 'user',
    content: input,
    createdAt: Date.now(),
  };
}

export class Engine {
  constructor(
    private readonly model: ModelProvider,
    private readonly memory: Memory,
    private readonly tools: ToolRegistry,
    private readonly options: EngineOptions,
  ) {}

  async run(input: string, sessionId: string): Promise<Message> {
    const userMessage = createUserMessage(input);

    await this.memory.save(sessionId, userMessage);

    const messages = await this.memory.buildContext(sessionId, userMessage);

    for (let step = 0; step < this.options.maxSteps; step++) {
      const output = await this.model.chat({
        messages,
        tools: this.tools.list(),
        options: {
          timeoutMs: this.options.requestTimeoutMs,
        },
      });

      const assistantMessage = output.message;

      if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
        await this.memory.save(sessionId, assistantMessage);
        return assistantMessage;
      }

      messages.push(assistantMessage);
      await this.memory.save(sessionId, assistantMessage);

      for (const toolCall of assistantMessage.toolCalls) {
        const resultMessage = await this.tools.execute(toolCall, {
          traceId: assistantMessage.id,
          sessionId,
        });

        messages.push(resultMessage);
        await this.memory.save(sessionId, resultMessage);
      }
    }

    throw new MaxStepsExceededError(this.options.maxSteps);
  }
}
```

核心逻辑：

```text
模型输出普通文本 -> 直接返回
模型输出 toolCalls -> 执行工具 -> 工具结果回填 messages -> 继续调用模型
超过 maxSteps -> 抛错
```

---

## 11. 实现入口文件

### 11.1 `src/main.ts`

```ts
import { Engine } from './runtime/engine';
import { InMemoryStore } from './memory/local-store';
import { MockProvider } from './models/mock-provider';
import { DefaultToolRegistry } from './tools/registry';

async function main() {
  const model = new MockProvider();
  const memory = new InMemoryStore();
  const tools = new DefaultToolRegistry();

  const engine = new Engine(model, memory, tools, {
    maxSteps: 8,
    requestTimeoutMs: 60_000,
    enableStream: false,
  });

  const response = await engine.run('帮我分析一下当前项目结构', 'default-session');

  console.log(response.content);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

### 11.2 `src/index.ts`

```ts
export * from './core';
export * from './runtime/engine';
export * from './memory/local-store';
export * from './models/mock-provider';
export * from './tools/registry';
```

---

## 12. 第一阶段验收

运行：

```bash
pnpm dev
```

期望输出：

```text
Mock response: 帮我分析一下当前项目结构
```

验收标准：

```text
1. pnpm dev 可以正常启动。
2. Engine 可以接收用户输入。
3. Memory 可以保存用户消息。
4. MockProvider 可以返回 Assistant 消息。
5. Engine 可以返回最终 Message。
6. 没有工具调用时，流程可以正常结束。
```

---

# 第二阶段：工具系统、安全与日志

## 13. 实现 EchoTool

### 13.1 `src/tools/builtin/echo.ts`

```ts
import type { Tool, ToolContext, ToolResult } from '../../core';

export class EchoTool implements Tool {
  name = 'echo';

  description = 'Return the input text directly.';

  schema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to echo',
      },
    },
    required: ['text'],
  };

  async call(
    input: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const text = typeof input.text === 'string' ? input.text : '';

    return {
      success: true,
      content: text,
    };
  }
}
```

---

## 14. 实现安全策略

### 14.1 `src/security/policy.ts`

```ts
export interface SecurityPolicy {
  allowTools: string[];
  denyTools: string[];
  sandboxDir: string;
  allowNetwork: boolean;
  allowShell: boolean;
  allowedShellCommands: string[];
}
```

### 14.2 `src/security/path.ts`

```ts
import path from 'node:path';

export function validateSandboxPath(baseDir: string, targetPath: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, targetPath);

  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error(`Path escapes sandbox: ${targetPath}`);
  }

  return target;
}
```

### 14.3 `src/security/guard.ts`

```ts
import type { SecurityPolicy } from './policy';

export class SecurityGuard {
  constructor(private readonly policy: SecurityPolicy) {}

  async checkToolPermission(
    toolName: string,
    _input: Record<string, unknown>,
  ): Promise<void> {
    if (this.policy.denyTools.includes(toolName)) {
      throw new Error(`Tool denied by policy: ${toolName}`);
    }

    if (
      this.policy.allowTools.length > 0 &&
      !this.policy.allowTools.includes(toolName)
    ) {
      throw new Error(`Tool not allowed by policy: ${toolName}`);
    }
  }
}
```

---

## 15. 实现日志模块

### 15.1 `src/reliability/logger.ts`

```ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});
```

---

## 16. 实现 ToolExecutor

### 16.1 `src/tools/executor.ts`

```ts
import type { Tool, ToolContext, ToolResult } from '../core';
import type { SecurityGuard } from '../security/guard';
import { logger } from '../reliability/logger';

export class ToolExecutor {
  constructor(private readonly securityGuard: SecurityGuard) {}

  async execute(
    tool: Tool,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    await this.securityGuard.checkToolPermission(tool.name, input);

    const startedAt = Date.now();

    try {
      const result = await tool.call(input, ctx);

      logger.info({
        traceId: ctx.traceId,
        sessionId: ctx.sessionId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error({
        traceId: ctx.traceId,
        sessionId: ctx.sessionId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        error,
      });

      throw error;
    }
  }
}
```

后续可以把 `DefaultToolRegistry.execute()` 改成内部调用 `ToolExecutor`，让所有工具统一经过：

```text
权限检查 -> 参数校验 -> 超时控制 -> 执行工具 -> 日志记录 -> 返回结果
```

---

## 17. 第二阶段验收

```text
1. EchoTool 可以注册。
2. Registry 可以查找到 EchoTool。
3. ToolExecutor 执行前会调用 SecurityGuard。
4. 工具执行成功时有 info 日志。
5. 工具执行失败时有 error 日志。
6. denyTools 中的工具不能执行。
```

---

# 第三阶段：真实模型与 Memory 增强

## 18. 实现 OpenAIProvider

### 18.1 目标

`OpenAIProvider` 只负责模型协议适配，不要把模型细节写入 `runtime/`。

职责：

```text
1. 将内部 Message 转成模型 API 消息格式。
2. 将 Tool 转成模型 API tool schema。
3. 请求模型接口。
4. 解析 assistant 文本。
5. 解析 tool_call。
6. 返回统一的 ModelChatOutput。
```

建议文件：

```text
src/models/openai-provider.ts
src/models/parser.ts
src/models/quality-gate.ts
```

环境变量：

```bash
export OPENAI_API_KEY=你的key
```

实现注意点：

```text
1. API Key 不要写死在代码里。
2. 请求超时使用 AbortController。
3. 统一处理 401、429、5xx、网络超时。
4. tool_call arguments 需要 JSON.parse，并捕获异常。
5. 返回的 tool_call id 必须保留，方便后续工具结果回填。
```

---

## 19. Memory 增强

第一版 `InMemoryStore` 只适合验证流程，后续建议升级为：

```text
1. SQLite 本地持久化
2. 最近 N 轮上下文
3. 关键词搜索
4. 摘要记忆
5. 上下文 token 裁剪
6. 多 session 隔离
```

建议新增：

```text
src/memory/context-builder.ts
src/memory/summarizer.ts
src/memory/sqlite-store.ts
```

上下文组装顺序：

```text
System Prompt
  -> 长期用户偏好
  -> 相关历史记忆
  -> 最近 N 轮消息
  -> 当前用户输入
```

---

## 20. 第三阶段验收

```text
1. 可以使用真实模型返回普通文本。
2. 可以使用真实模型返回 tool_call。
3. tool_call 可以被 Engine 识别并执行。
4. 最近 N 轮上下文可以被正确加入 messages。
5. 模型请求失败不会导致进程无提示崩溃。
6. 错误日志里包含 traceId、sessionId、modelName。
```

---

# 第四阶段：MCP 集成

## 21. MCP 实现目标

```text
MCP Server 工具
  -> MCP Client 发现
  -> McpToolAdapter 转换
  -> 注册到 ToolRegistry
  -> Runtime 正常调用
```

关键原则：

```text
runtime/ 不直接感知 MCP 协议
mcp/ 负责协议适配
MCP 工具最终转换为 core.Tool
```

---

## 22. 建议文件

```text
src/mcp/protocol.ts
src/mcp/client.ts
src/mcp/discovery.ts
src/mcp/adapter.ts
```

---

## 23. McpToolAdapter 示例

```ts
import type { Tool, ToolContext, ToolResult } from '../core';
import type { McpClient } from './client';

export class McpToolAdapter implements Tool {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly schema: unknown,
    private readonly client: McpClient,
  ) {}

  async call(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const result = await this.client.callTool({
      name: this.name,
      arguments: input,
      traceId: ctx.traceId,
    });

    return {
      success: true,
      content: result.content,
      metadata: result.metadata,
    };
  }
}
```

---

## 24. 第四阶段验收

```text
1. 可以配置 MCP Server。
2. 可以连接 MCP Server。
3. 可以发现 MCP 工具列表。
4. MCP 工具可以转换成内部 Tool。
5. MCP 工具可以注册进 DefaultToolRegistry。
6. Engine 可以调用 MCP 工具。
7. MCP 调用失败时有明确错误日志。
```

---

# 第五阶段：编排引擎

## 25. 编排模块目标

编排模块用于复杂任务，例如：

```text
1. 自动代码审查
2. 测试用例生成
3. 文档生成
4. 多工具组合任务
5. 多 Agent 协作任务
```

---

## 26. 任务结构

### 26.1 `src/orchestration/task.ts`

```ts
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dependsOn: string[];
  result?: string;
  error?: string;
}
```

建议文件：

```text
src/orchestration/planner.ts
src/orchestration/state-machine.ts
src/orchestration/coordinator.ts
src/orchestration/graph.ts
```

---

## 27. 第五阶段验收

```text
1. 可以把复杂目标拆成多个 Task。
2. Task 支持 pending、running、done、failed、skipped 状态。
3. Task 之间支持 dependsOn 依赖。
4. 某个 Task 失败后可以重试或降级。
5. 多个 Agent 可以按角色协作。
```

---

# 28. 测试计划

## 28.1 单元测试覆盖范围

```text
core/message 类型
DefaultToolRegistry 注册与查找
ToolExecutor 权限校验
InMemoryStore 读写
Engine 主循环
SecurityGuard 拦截逻辑
validateSandboxPath 路径校验
```

---

## 28.2 Registry 测试示例

```ts
import { describe, expect, it } from 'vitest';
import { DefaultToolRegistry } from '../src/tools/registry';
import { EchoTool } from '../src/tools/builtin/echo';

describe('DefaultToolRegistry', () => {
  it('registers and gets a tool', () => {
    const registry = new DefaultToolRegistry();
    const tool = new EchoTool();

    registry.register(tool);

    expect(registry.get('echo')).toBe(tool);
  });
});
```

---

## 28.3 集成测试覆盖范围

```text
1. 用户输入 -> MockProvider -> assistant 输出。
2. 用户输入 -> 模型 tool_call -> 工具执行 -> 最终输出。
3. 工具不存在时返回 ToolNotFoundError。
4. 超过 maxSteps 后抛出 MaxStepsExceededError。
5. 安全策略拒绝工具调用。
6. MCP 工具调用失败时有错误日志。
```

---

# 29. 推荐开发顺序

```text
1. 初始化工程
2. 创建目录结构
3. 实现 core/message.ts
4. 实现 core/tool.ts
5. 实现 core/model.ts
6. 实现 core/memory.ts
7. 实现 core/errors.ts
8. 实现 utils/id.ts
9. 实现 memory/local-store.ts
10. 实现 models/mock-provider.ts
11. 实现 tools/registry.ts
12. 实现 runtime/engine.ts
13. 实现 main.ts
14. 跑通 pnpm dev
15. 增加 EchoTool
16. 增加 SecurityGuard
17. 增加 Logger
18. 增加 ToolExecutor
19. 编写单元测试
20. 接入真实模型 Provider
21. 增强 Memory
22. 接入 MCP
23. 实现 orchestration
```

---

# 30. Git 提交建议

```bash
git init

git add .
git commit -m "chore: init miniharness ts project"

git add src/core src/utils
git commit -m "feat(core): add basic interfaces and id helper"

git add src/memory src/models src/tools src/runtime src/main.ts
git commit -m "feat(runtime): implement minimal agent loop"

git add src/tools/builtin src/security src/reliability
git commit -m "feat(tools): add tool execution guard and logging"

git add tests
git commit -m "test: add basic unit tests"
```

---

# 31. 最终交付物

```text
1. MiniHarness TypeScript 源码
2. README.md
3. IMPLEMENTATION.md
4. configs/harness.yaml
5. examples/simple-agent
6. examples/tool-call
7. examples/mcp-demo
8. tests 单元测试与集成测试
```

---

# 32. MVP 完成标准

```text
1. pnpm install 成功。
2. pnpm dev 可以启动。
3. Engine 可以处理普通用户输入。
4. Memory 可以保存当前 session 消息。
5. MockProvider 可以返回 assistant 消息。
6. ToolRegistry 可以注册工具。
7. EchoTool 可以被执行。
8. 安全策略可以阻止不允许的工具。
9. 日志可以记录 traceId、sessionId、toolName、latencyMs。
10. pnpm test 可以通过基础测试。
```

---

# 33. 关键注意事项

## 33.1 不要一开始就接真实模型

先用 `MockProvider` 跑通主链路，避免问题混杂。

错误排查顺序应是：

```text
先验证 Harness 主流程
再验证工具调用
再验证真实模型 Provider
再验证 MCP
```

---

## 33.2 runtime 不要依赖具体模型厂商

错误做法：

```text
runtime/engine.ts 里直接写 OpenAI 请求逻辑
```

正确做法：

```text
runtime/engine.ts 只依赖 ModelProvider 接口
OpenAIProvider 单独放在 models/openai-provider.ts
```

---

## 33.3 MCP 不要侵入 runtime

错误做法：

```text
Engine 里判断这个工具是不是 MCP 工具
```

正确做法：

```text
MCP 工具通过 McpToolAdapter 转成 core.Tool
Engine 只认识 Tool 接口
```

---

## 33.4 工具调用必须有安全边界

所有工具调用都应经过：

```text
参数校验
权限校验
路径校验
超时控制
日志审计
结果裁剪
```

尤其是：

```text
file tool
shell tool
http tool
mcp tool
```

---

## 33.5 Agent 循环必须限制 `maxSteps`

必须配置：

```ts
maxSteps: 8
```

避免模型反复调用工具，导致死循环。

---

# 34. 总结

MiniHarness 的实现路线应坚持：

```text
先跑通主链路
再补工具系统
再补安全和日志
再接真实模型
再接 MCP
最后做复杂编排
```

第一版只需要完成：

```text
Message
Tool
ModelProvider
Memory
Engine
ToolRegistry
MockProvider
InMemoryStore
```

这条链路跑通后，后续模块都可以围绕接口逐步扩展，不需要推翻已有设计。
