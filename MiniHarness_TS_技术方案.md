# MiniHarness TypeScript 技术方案

## 1. 背景与目标

MiniHarness 是一个轻量级 Agent Harness 框架，用于统一管理 Agent 的运行循环、模型调用、工具调用、记忆管理、MCP 接入、任务编排、安全控制与可观测性。

本方案按照“按子系统分包”的原则设计，每个目录对应一个 Harness 子系统：

| 目录 | 对应子系统 | 职责 | 首次实现阶段 |
|---|---|---|---|
| `core/` | 公共基础 | 消息、工具、智能体、事件接口定义 | 第一阶段 |
| `runtime/` | 运行时引擎 | Agent 循环、流式处理、事件驱动 | 第一阶段 |
| `tools/` | 工具层 | 工具注册、执行流水线、内置工具 | 第二阶段 |
| `memory/` | 记忆子系统 | 存储、上下文组装、记忆整合 | 第三阶段 |
| `models/` | 模型集成 | Provider 抽象、输出解析、质量门控 | 第三阶段 |
| `orchestration/` | 编排引擎 | 任务分解、状态机、多智能体协调 | 第五阶段 |
| `mcp/` | MCP 集成 | MCP 客户端、工具发现、协议适配 | 第四阶段 |
| `reliability/` | 可靠性与可观测性 | 日志、追踪、监控指标、容错机制 | 第二阶段 |
| `security/` | 安全防护 | 权限管理、路径校验、护栏、安全执行 | 第二阶段 |
| `utils/` | 工具类 | 配置管理等辅助模块 | 第一阶段 |

---

## 2. 技术选型

### 2.1 开发语言

开发语言采用 TypeScript。

推荐运行环境：

```text
Node.js >= 20
TypeScript >= 5.x
pnpm >= 9
```

### 2.2 推荐依赖

| 类型 | 推荐库 | 用途 |
|---|---|---|
| 类型校验 | `zod` | 工具参数 Schema、配置校验 |
| 日志 | `pino` | 高性能结构化日志 |
| 测试 | `vitest` | 单元测试、集成测试 |
| 打包 | `tsup` | TS 项目构建 |
| 配置 | `yaml` | 读取 YAML 配置 |
| HTTP | `undici` | Provider / MCP HTTP 请求 |
| CLI | `commander` | 命令行入口 |
| UUID | `nanoid` | trace_id、message_id 生成 |

---

## 3. 总体架构

```mermaid
flowchart TD
    A[User / API / CLI] --> B[security Guard]
    B --> C[runtime Engine]
    C --> D[memory Context Builder]
    C --> E[models Provider]
    C --> F[tools Registry]
    F --> G[tools Executor]
    G --> H[mcp Adapter / Builtin Tools]
    C --> I[orchestration Planner]
    C --> J[reliability Logger / Trace / Metrics]
```

核心调用链：

```text
用户输入
  -> 安全检查
  -> 组装上下文
  -> 调用模型
  -> 解析模型输出
  -> 判断是否需要调用工具
  -> 执行工具
  -> 工具结果回填模型
  -> 生成最终响应
  -> 保存记忆与日志
```

---

## 4. 项目目录结构

```text
MiniHarness/
├── src/
│   ├── core/
│   │   ├── message.ts
│   │   ├── event.ts
│   │   ├── agent.ts
│   │   ├── tool.ts
│   │   ├── model.ts
│   │   ├── memory.ts
│   │   ├── registry.ts
│   │   └── errors.ts
│   │
│   ├── runtime/
│   │   ├── engine.ts
│   │   ├── loop.ts
│   │   ├── stream.ts
│   │   ├── dispatcher.ts
│   │   └── session.ts
│   │
│   ├── tools/
│   │   ├── registry.ts
│   │   ├── executor.ts
│   │   ├── pipeline.ts
│   │   └── builtin/
│   │       ├── echo.ts
│   │       ├── file.ts
│   │       ├── http.ts
│   │       └── shell.ts
│   │
│   ├── memory/
│   │   ├── store.ts
│   │   ├── local-store.ts
│   │   ├── context-builder.ts
│   │   └── summarizer.ts
│   │
│   ├── models/
│   │   ├── provider.ts
│   │   ├── mock-provider.ts
│   │   ├── openai-provider.ts
│   │   ├── parser.ts
│   │   └── quality-gate.ts
│   │
│   ├── orchestration/
│   │   ├── planner.ts
│   │   ├── state-machine.ts
│   │   ├── coordinator.ts
│   │   └── graph.ts
│   │
│   ├── mcp/
│   │   ├── client.ts
│   │   ├── discovery.ts
│   │   ├── adapter.ts
│   │   └── protocol.ts
│   │
│   ├── reliability/
│   │   ├── logger.ts
│   │   ├── trace.ts
│   │   ├── metrics.ts
│   │   ├── retry.ts
│   │   ├── circuit-breaker.ts
│   │   └── recovery.ts
│   │
│   ├── security/
│   │   ├── policy.ts
│   │   ├── guard.ts
│   │   ├── path.ts
│   │   ├── sandbox.ts
│   │   └── permission.ts
│   │
│   ├── utils/
│   │   ├── config.ts
│   │   ├── json.ts
│   │   ├── id.ts
│   │   └── time.ts
│   │
│   ├── index.ts
│   └── main.ts
│
├── configs/
│   └── harness.yaml
│
├── examples/
│   ├── simple-agent/
│   ├── tool-call/
│   └── mcp-demo/
│
├── tests/
│   ├── runtime.test.ts
│   ├── tool.test.ts
│   ├── memory.test.ts
│   └── security.test.ts
│
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 5. 核心模块设计

## 5.1 `core/` 公共基础层

`core/` 只定义基础类型、接口和错误，不依赖具体实现。

### 5.1.1 消息结构

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

- `type Role = ...` 用于限制角色只能是固定字符串。
- `interface Message` 用于定义消息对象结构。
- `Record<string, unknown>` 表示一个键为字符串、值未知的对象，比 `any` 更安全。
- `toolCalls?` 中的 `?` 表示可选字段。

### 5.1.2 工具接口

```ts
export interface ToolResult {
  success: boolean;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  schema: unknown;
  call(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  traceId: string;
  sessionId: string;
  abortSignal?: AbortSignal;
}
```

设计原则：所有工具都实现统一的 `Tool` 接口。无论是内置工具、MCP 工具，还是业务自定义工具，都可以注册到同一个工具注册中心。

### 5.1.3 模型 Provider 接口

```ts
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

`AsyncIterable` 说明：

```ts
for await (const event of provider.stream(input)) {
  // 逐步处理流式输出
}
```

这适合实现模型的流式输出。

---

## 5.2 `runtime/` 运行时引擎

`runtime/` 是 Harness 的核心，负责 Agent 主循环。

### 5.2.1 Engine 结构

```ts
import type { Memory, Message, ModelProvider, ToolRegistry } from '../core';

export interface EngineOptions {
  maxSteps: number;
  requestTimeoutMs: number;
  enableStream: boolean;
}

export class Engine {
  constructor(
    private readonly model: ModelProvider,
    private readonly memory: Memory,
    private readonly tools: ToolRegistry,
    private readonly options: EngineOptions,
  ) {}

  async run(input: string, sessionId: string): Promise<Message> {
    // 1. 创建用户消息
    // 2. 组装上下文
    // 3. 调用模型
    // 4. 执行工具调用
    // 5. 返回最终结果
    throw new Error('not implemented');
  }
}
```

TypeScript 说明：

- `class Engine` 定义运行时引擎对象。
- `private readonly model` 表示构造后不可修改，只能在类内部访问。
- `Promise<Message>` 表示异步函数最终返回一条消息。

### 5.2.2 Agent 主循环

```ts
async run(input: string, sessionId: string): Promise<Message> {
  const userMessage = createUserMessage(input);

  await this.memory.save(sessionId, userMessage);

  let messages = await this.memory.buildContext(sessionId, userMessage);

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

    for (const toolCall of assistantMessage.toolCalls) {
      const resultMessage = await this.tools.execute(toolCall, {
        traceId: assistantMessage.id,
        sessionId,
      });

      messages.push(resultMessage);
      await this.memory.save(sessionId, resultMessage);
    }
  }

  throw new Error(`Agent loop exceeded maxSteps=${this.options.maxSteps}`);
}
```

关键控制点：

1. `maxSteps` 防止 Agent 无限循环。
2. 每次模型输出都判断是否包含 `toolCalls`。
3. 工具结果作为 `tool` 消息重新追加到上下文。
4. 最终没有工具调用时，返回 Assistant 消息。

---

## 5.3 `tools/` 工具层

工具层负责工具注册、工具查询、工具执行和调用审计。

### 5.3.1 工具注册中心

```ts
import type { Tool, ToolCall, ToolContext, Message } from '../core';

export class DefaultToolRegistry {
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
      throw new Error(`Tool not found: ${toolCall.name}`);
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

`Map<string, Tool>` 说明：

- `Map` 适合做注册表。
- key 是工具名称。
- value 是工具实例。

### 5.3.2 工具执行流水线

工具调用不要直接执行，建议经过统一 pipeline：

```text
ToolCall
  -> 参数校验
  -> 权限检查
  -> 超时控制
  -> 执行工具
  -> 结果裁剪
  -> 日志记录
  -> 返回 ToolResult
```

示例：

```ts
export class ToolExecutor {
  constructor(
    private readonly securityGuard: SecurityGuard,
    private readonly logger: Logger,
  ) {}

  async execute(tool: Tool, input: Record<string, unknown>, ctx: ToolContext) {
    await this.securityGuard.checkToolPermission(tool.name, input);

    const startedAt = Date.now();

    try {
      const result = await tool.call(input, ctx);

      this.logger.info({
        traceId: ctx.traceId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error({
        traceId: ctx.traceId,
        toolName: tool.name,
        error,
      });

      throw error;
    }
  }
}
```

---

## 5.4 `memory/` 记忆子系统

记忆模块负责保存历史消息、读取相关上下文、压缩长会话。

### 5.4.1 Memory 接口

```ts
export interface Memory {
  save(sessionId: string, message: Message): Promise<void>;

  loadRecent(sessionId: string, limit: number): Promise<Message[]>;

  search(sessionId: string, query: string, topK: number): Promise<Message[]>;

  buildContext(sessionId: string, input: Message): Promise<Message[]>;
}
```

### 5.4.2 上下文组装策略

推荐上下文顺序：

```text
System Prompt
  +
长期用户偏好
  +
相关历史记忆
  +
最近 N 轮对话
  +
当前用户输入
```

第一版可以先实现本地内存存储：

```ts
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
      .filter((m) => m.content.includes(query))
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

后续可以升级为：

```text
SQLite 本地存储
  -> 向量检索
  -> 摘要记忆
  -> 多会话记忆隔离
```

---

## 5.5 `models/` 模型集成

模型模块对外只暴露统一的 `ModelProvider`。

### 5.5.1 Mock Provider

第一阶段先使用 Mock Provider 跑通框架。

```ts
export class MockProvider implements ModelProvider {
  name = 'mock';

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const last = input.messages.at(-1);

    return {
      message: {
        id: createId(),
        role: 'assistant',
        content: `Mock response: ${last?.content ?? ''}`,
        createdAt: Date.now(),
      },
    };
  }
}
```

### 5.5.2 真实 Provider

真实 Provider 负责处理：

```text
1. 消息格式转换
2. 工具 Schema 转换
3. 模型 API 调用
4. 流式输出解析
5. tool_call 解析
6. token usage 统计
7. 错误码归一化
```

建议每个模型供应商单独实现：

```text
OpenAIProvider
ClaudeProvider
GeminiProvider
LocalProvider
```

不要把不同厂商的协议细节写入 `runtime/`。

---

## 5.6 `mcp/` MCP 集成

MCP 模块负责外部工具发现和协议适配。

设计目标：MCP 工具最终转换成内部统一的 `Tool`。

```text
MCP Server
  -> MCP Client
  -> Discovery
  -> Adapter
  -> core.Tool
  -> tools.Registry
```

### 5.6.1 MCP Tool Adapter

```ts
export class McpToolAdapter implements Tool {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly schema: unknown,
    private readonly client: McpClient,
  ) {}

  async call(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
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

这样 `runtime/` 不需要关心工具来自 MCP、本地函数，还是业务插件。

---

## 5.7 `orchestration/` 编排引擎

编排层用于复杂任务，如代码审查、自动测试生成、文档生成、多 Agent 协同。

### 5.7.1 任务结构

```ts
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

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

### 5.7.2 状态机

```text
pending -> running -> done
pending -> running -> failed
failed  -> running -> done
pending -> skipped
```

### 5.7.3 适用场景

```text
1. 用户给出复杂目标，需要拆成多个步骤。
2. 一个任务需要多个工具组合完成。
3. 一个任务需要多个 Agent 角色协作。
4. 任务之间存在依赖关系。
5. 某一步失败后需要降级或回滚。
```

---

## 5.8 `reliability/` 可靠性与可观测性

### 5.8.1 日志字段

每次请求建议记录：

```text
trace_id
session_id
request_id
model_name
tool_name
latency_ms
success
error_code
retry_count
token_usage
```

### 5.8.2 重试策略

可重试错误：

```text
网络超时
限流
临时 5xx
MCP 短暂连接失败
```

不应重试错误：

```text
权限拒绝
参数错误
工具不存在
路径越权
安全策略拦截
```

### 5.8.3 熔断策略

```text
同一工具连续失败达到阈值
  -> 进入 open 状态
  -> 短时间拒绝调用
  -> 到达恢复窗口后半开探测
  -> 成功则恢复，失败则继续熔断
```

---

## 5.9 `security/` 安全防护

安全模块应在工具调用、文件访问、命令执行前生效。

### 5.9.1 安全策略

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

### 5.9.2 路径校验

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

该函数用于防止：

```text
../../etc/passwd
/root/.ssh/id_rsa
C:\Windows\System32\config
```

### 5.9.3 命令执行控制

Shell 工具必须限制：

```text
1. 是否允许启用 shell
2. 命令白名单
3. 工作目录必须在 sandbox 内
4. 超时时间
5. 输出最大长度
6. 环境变量脱敏
```

---

## 6. 配置文件设计

`configs/harness.yaml`：

```yaml
runtime:
  maxSteps: 8
  requestTimeoutMs: 60000
  toolTimeoutMs: 30000
  enableStream: true

model:
  provider: openai
  model: gpt-4.1
  temperature: 0.2
  maxTokens: 4096

memory:
  type: local
  path: ./data/memory.db
  recentLimit: 20
  searchTopK: 5

tools:
  enableBuiltin: true
  allowShell: false
  allowFile: true
  allowHttp: true

mcp:
  enable: true
  servers:
    - name: local-tools
      transport: http
      url: http://127.0.0.1:3001

security:
  sandboxDir: ./workspace
  allowNetwork: true
  allowShellCommands:
    - git
    - node
    - npm
    - pnpm
    - python

reliability:
  enableTrace: true
  enableMetrics: true
  retry:
    maxAttempts: 3
    backoffMs: 500
```

配置读取建议使用 `zod` 做校验，避免启动后才发现配置错误。

---

## 7. 最小可运行示例

### 7.1 `package.json`

```json
{
  "name": "miniharness",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "test": "vitest run",
    "lint": "eslint src tests"
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

### 7.2 `main.ts`

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

TypeScript 说明：

- `async function main()` 表示异步主函数。
- `await engine.run(...)` 等待 Harness 执行完成。
- `main().catch(...)` 用于捕获最外层异常，防止 Promise 未处理。

---

## 8. 开发阶段规划

## 第一阶段：最小 Harness 骨架

目标：跑通普通输入输出。

实现内容：

```text
core/message.ts
core/tool.ts
core/model.ts
core/memory.ts
runtime/engine.ts
models/mock-provider.ts
memory/local-store.ts
tools/registry.ts
main.ts
```

验收标准：

```text
1. 可以接收用户输入。
2. 可以调用 MockProvider。
3. 可以返回 Assistant 消息。
4. 可以保存最近会话。
5. 可以通过 npm/pnpm 启动。
```

---

## 第二阶段：工具系统、安全与日志

目标：工具可注册、可执行、可追踪、可拦截。

实现内容：

```text
tools/executor.ts
tools/pipeline.ts
tools/builtin/echo.ts
tools/builtin/file.ts
security/guard.ts
security/path.ts
reliability/logger.ts
```

验收标准：

```text
1. 工具可以注册到 Registry。
2. 工具调用前能做权限校验。
3. 文件工具不能越过 sandbox。
4. 工具执行有超时控制。
5. 工具调用有结构化日志。
```

---

## 第三阶段：真实模型与 Memory

目标：接入真实模型 Provider，并完善上下文组装。

实现内容：

```text
models/openai-provider.ts
models/parser.ts
models/quality-gate.ts
memory/context-builder.ts
memory/summarizer.ts
```

验收标准：

```text
1. 支持真实模型调用。
2. 支持模型 tool_call 输出解析。
3. 支持最近 N 轮上下文。
4. 支持上下文长度控制。
5. 模型异常不会导致进程崩溃。
```

---

## 第四阶段：MCP 集成

目标：接入外部 MCP 工具生态。

实现内容：

```text
mcp/client.ts
mcp/discovery.ts
mcp/adapter.ts
mcp/protocol.ts
```

验收标准：

```text
1. 可以连接 MCP Server。
2. 可以发现 MCP 工具。
3. 可以将 MCP 工具转换成 core.Tool。
4. 可以通过 Runtime 调用 MCP 工具。
5. MCP 调用失败有明确日志和错误信息。
```

---

## 第五阶段：编排引擎

目标：支持复杂任务拆解和多 Agent 协同。

实现内容：

```text
orchestration/planner.ts
orchestration/state-machine.ts
orchestration/coordinator.ts
orchestration/graph.ts
```

验收标准：

```text
1. 可以将复杂任务拆成多个子任务。
2. 子任务支持状态流转。
3. 任务之间支持依赖关系。
4. 支持失败重试或降级。
5. 支持多个 Agent 分工协作。
```

---

## 9. 测试方案

### 9.1 单元测试

重点覆盖：

```text
core 类型转换
工具注册与查找
工具参数校验
memory 读写
security 路径校验
runtime 主循环
models 输出解析
```

示例：

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

### 9.2 集成测试

覆盖：

```text
1. 用户输入 -> 模型 -> 文本输出。
2. 用户输入 -> 模型 -> 工具调用 -> 最终输出。
3. 用户输入 -> MCP 工具调用。
4. 工具失败后的错误恢复。
5. 权限拒绝场景。
6. 最大循环次数限制。
```

---

## 10. 关键设计原则

### 10.1 `core/` 不依赖业务实现

正确依赖方向：

```text
runtime -> core
models  -> core
tools   -> core
memory  -> core
mcp     -> core
```

避免：

```text
core -> runtime
core -> openai-provider
core -> mcp-client
```

### 10.2 所有外部能力抽象成接口

模型、工具、记忆、MCP 都通过接口交互。这样可以替换实现，不影响主流程。

### 10.3 工具调用必须可控

工具调用必须经过：

```text
工具注册中心
参数校验
权限策略
路径校验
沙箱限制
超时控制
日志审计
```

### 10.4 Agent 循环必须有上限

必须配置 `maxSteps`，防止模型反复调用工具导致死循环。

### 10.5 MCP 作为适配层，不侵入 runtime

MCP 协议细节只存在于 `mcp/` 目录中。`runtime/` 只认识统一的 `Tool` 接口。

---

## 11. 推荐落地顺序

推荐按以下顺序开发：

```text
1. core/
2. memory/local-store.ts
3. models/mock-provider.ts
4. tools/registry.ts
5. runtime/engine.ts
6. tools/executor.ts
7. security/guard.ts
8. reliability/logger.ts
9. models/openai-provider.ts
10. mcp/
11. orchestration/
```

第一版不要追求功能完整，先把主链路跑通：

```text
输入 -> 上下文 -> 模型 -> 输出
```

第二版再补：

```text
工具调用 -> 安全控制 -> 日志追踪
```

第三版再接入：

```text
真实模型 -> MCP -> 编排引擎
```

---

## 12. 最终交付物

| 交付物 | 说明 |
|---|---|
| MiniHarness TS 源码 | 完整 TypeScript 工程 |
| README.md | 项目说明、快速启动、配置说明 |
| configs/harness.yaml | 默认配置文件 |
| examples/ | 普通对话、工具调用、MCP 示例 |
| tests/ | 单元测试和集成测试 |
| 架构文档 | 本技术方案和模块设计文档 |

---

## 13. 总结

MiniHarness 的核心思想是：

```text
core 定标准
runtime 跑循环
tools 管工具
memory 组上下文
models 接模型
mcp 接外部工具生态
orchestration 做复杂任务编排
reliability 保证稳定性
security 保证安全边界
utils 提供基础辅助能力
```

第一阶段只需要实现最小闭环：

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

这条链路跑通后，再逐步扩展工具执行、安全控制、真实模型、MCP 集成、任务编排和可观测性。
