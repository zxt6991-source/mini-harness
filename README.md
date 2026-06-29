# MiniHarness

MiniHarness is a lightweight TypeScript Agent Harness. The current version runs a minimal agent loop with configurable memory, Markdown frontmatter long-term memory entries, mock and OpenAI-compatible model providers, MCP HTTP tool adapters, task orchestration, tool registration, security checks, structured tool logs, and configurable context assembly.

## Requirements

- Node.js >= 20
- pnpm >= 9

## Quick Start

```bash
pnpm install
pnpm dev
```

Expected output:

```text
Mock response: 帮我分析一下当前项目结构
```

## Scripts

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

## Project Structure

```text
src/core/          Shared interfaces and errors
src/runtime/       Agent loop engine
src/memory/        Message store, Markdown memory entries, context builder, consolidation
src/mcp/           HTTP MCP client, discovery, tool adapter
src/models/        Mock provider, OpenAI provider, Chat Completions provider, parsers, quality gate
src/orchestration/ Task graph, planner, state machine, coordinator
src/tools/         Tool registry, executor, and builtin tools
src/security/      Tool policy and sandbox path checks
src/reliability/   Structured logger
src/utils/         Shared helpers
configs/           Default harness configuration
examples/          Usage notes for future examples
tests/             Unit and integration tests
```

## Current Scope

Implemented:

- Message, Tool, ModelProvider, Memory interfaces
- InMemoryStore
- MarkdownMemoryStore
- ConsolidatingMemory
- SessionLogStore
- ContextBuilder
- ContextRequirement analyzer
- ContextCache
- ConsolidationEngine
- SimpleSummarizer
- MockProvider
- OpenAIProvider
- OpenAI Responses API parser
- ChatCompletionsProvider
- Chat Completions parser
- Config-driven provider factory
- Model output quality gate
- HttpMcpClient
- discoverMcpTools
- McpToolAdapter
- SimplePlanner
- TaskGraph
- TaskStateMachine
- Coordinator
- OrchestrationEngine
- WorkflowStateMachine
- InMemoryCheckpointStore
- OrchestrationMessageBus
- Scratchpad
- AgentExecutionContext
- DefaultToolRegistry
- Engine main loop
- EchoTool
- SecurityGuard
- ToolExecutor
- Logger
- Basic tests

Not implemented yet:

- SQLite memory persistence
- Vector memory index
- MCP stdio transport and persistent schema cache
- Persistent orchestration state
- Real multi-process or networked agent workers
- File, HTTP, and Shell tools

## OpenAI Provider

`OpenAIProvider` supports real OpenAI Responses API calls when `OPENAI_API_KEY` is available. Tests use a mock `fetchFn`, so the normal test suite does not require a network call or API key.

```ts
import { OpenAIProvider } from './src';

const provider = new OpenAIProvider({
  model: 'gpt-5.5',
});
```

The provider maps internal `Message[]` and `Tool[]` into Responses API input and function tools, then parses assistant text and `function_call` output back into `ModelChatOutput`.

## DeepSeek Provider

DeepSeek is supported through the OpenAI-compatible Chat Completions provider. Keep API keys in environment variables, not in `configs/harness.yaml`.

```yaml
model:
  provider: deepseek
  deepseek:
    model: deepseek-v4-flash
    apiKeyEnv: DEEPSEEK_API_KEY
    baseUrl: https://api.deepseek.com
```

```bash
export DEEPSEEK_API_KEY=sk-<redacted>
pnpm dev
```

Alternatively, put the key in a local `.env` file:

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-<redacted>
```

`loadHarnessConfig()` reads `.env` automatically before creating the configured provider. Values already set in the shell take precedence over `.env` values.

The default configuration still uses `provider: mock`, so local development and tests do not require a real model API key.

## Memory and Context

`createMemory(config.memory)` builds the configured memory implementation. The default `local` memory keeps recent messages in process memory, appends raw messages to `.miniharness/memory/session_logs/*.jsonl`, and stores long-term memories as Markdown files with YAML frontmatter under `.miniharness/memory/by_type/`.

```yaml
memory:
  type: local
  rootDir: .miniharness/memory
  recentLimit: 20
  searchTopK: 5
  context:
    systemPrompt: You are MiniHarness Agent.
    maxContextCharacters: 12000
  consolidation:
    enabled: true
    sessionGate: 5
```

`ContextBuilder` still supports the existing system prompt, summary, relevant message search, recent messages, and current input order. When the memory implementation exposes long-term entry search, it also injects a `Relevant memory` system section before recent messages.

`ConsolidationEngine` runs from the optional memory lifecycle hook after successful runs. It uses lightweight local heuristics for explicit memory signals such as “记住这个” or “保存进度”, project updates, and error lessons. It does not require an extra model call.

## MCP Integration

`HttpMcpClient` supports MCP initialization/session lifecycle, JSON and `text/event-stream` Streamable HTTP responses, tool discovery, tool calls, and resource/prompt client methods. Tests use a mock `fetchFn`, so the normal test suite does not require a live MCP server.

```ts
import { DefaultToolRegistry, HttpMcpClient, discoverMcpTools } from './src';

const client = new HttpMcpClient({
  endpoint: 'http://127.0.0.1:3001/mcp',
  serverName: 'local-tools',
});

const registry = new DefaultToolRegistry();
for (const tool of await discoverMcpTools(client)) {
  registry.register(tool);
}
```

`discoverMcpTools()` initializes clients that expose `initialize()`, caches tool discovery results for a short TTL, and wraps remote MCP tools as safe internal `Tool` names while preserving the original MCP tool name for `tools/call`. The runtime still only sees `Tool` objects; MCP protocol details stay inside `src/mcp/`.

## Runtime Events and Recovery

`Engine.run()` remains the compatibility API for callers that only need the final assistant message. `Engine.runEvents()` exposes the same run as an async event stream for UIs, logs, and future control-plane integrations.

```ts
const engine = new Engine(model, memory, tools, config.runtime);

for await (const event of engine.runEvents('hello', 'session_1')) {
  if (event.type === 'model_message') {
    console.log(event.message.content);
  }

  if (event.type === 'runtime_error') {
    console.error(event.phase, event.message);
  }
}
```

Runtime options now cover tool scheduling, recovery, budgets, and drift checks:

```yaml
runtime:
  maxSteps: 8
  requestTimeoutMs: 60000
  enableStream: false
  maxConcurrentTools: 1
  toolErrorMode: throw # throw | observe
  modelRetry:
    maxRetries: 0
    initialBackoffMs: 250
    maxBackoffMs: 2000
  budget:
    maxModelCalls: 20
    maxEstimatedTokens: 1000000
    maxContextCharacters: 120000
    reserveOutputTokens: 4000
  drift:
    maxToolCalls: 50
    repeatedToolWindow: 6
    repeatedToolThreshold: 1000000
    reflectionInterval: 0
```

`toolErrorMode: observe` converts tool failures into `role: "tool"` messages with `success: false` metadata, allowing the model to recover in the next loop. The default remains `throw` to preserve existing behavior.

Tool calls from the same assistant message can run concurrently with `maxConcurrentTools`, while tool result messages are still appended in the original call order to preserve prompt-prefix stability.

## Orchestration

The orchestration layer can split goals into tasks, validate task dependencies, run tasks in dependency order or bounded parallel groups, retry failed tasks, downgrade blocked descendants to `skipped`, and dispatch work to role-specific handlers. It also exposes workflow/task lifecycle events, an in-memory checkpoint store, a workflow state machine, a message bus, scratchpad state sharing, and isolated agent execution contexts.

```ts
import { Coordinator, SimplePlanner } from './src';

const planner = new SimplePlanner();
const tasks = await planner.plan({
  goal: 'Ship feature',
  steps: [
    { title: 'Plan', role: 'planner' },
    { id: 'build', title: 'Build', role: 'builder', dependsOn: ['task_1'] },
  ],
});

const coordinator = new Coordinator({
  maxRetries: 1,
  continueOnFailure: true,
  maxConcurrentTasks: 2,
  handlers: {
    planner: async (task) => ({ result: `${task.title} done` }),
    builder: async (task) => ({ result: `${task.title} done` }),
  },
});

await coordinator.run(tasks);
```

For lifecycle observation, use `runEvents()`:

```ts
for await (const event of coordinator.runEvents(tasks, {
  workflowRunId: 'workflow_1',
})) {
  console.log(event.type, event.taskId);
}
```

Workflow-level orchestration composes a finite state machine with task execution:

```ts
import { OrchestrationEngine } from './src';

const engine = new OrchestrationEngine({
  workflow: {
    id: 'ship_feature',
    name: 'Ship feature',
    version: '1.0.0',
    initialState: 'start',
    states: [
      { id: 'start', type: 'initial' },
      { id: 'build', type: 'normal', taskIds: ['build'] },
      { id: 'complete', type: 'final' },
    ],
    transitions: [
      { from: 'start', to: 'build' },
      { from: 'build', to: 'complete' },
    ],
  },
  handlers: {
    default: async (task) => ({ result: `${task.title} done` }),
  },
});
```

Default orchestration config:

```yaml
orchestration:
  enabled: true
  defaultRole: default
  maxRetries: 1
  continueOnFailure: true
  maxConcurrentTasks: 1
  defaultTaskTimeoutMs: 300000
  retry:
    initialBackoffMs: 250
    maxBackoffMs: 5000
  checkpoint:
    enabled: true
    store: memory
    rootDir: .miniharness/orchestration/checkpoints
  messages:
    maxQueueSize: 1000
    requireAckByDefault: false
  scratchpad:
    maxEntries: 1000
    maxValueCharacters: 20000
```
