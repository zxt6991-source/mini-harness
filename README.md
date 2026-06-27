# MiniHarness

MiniHarness is a lightweight TypeScript Agent Harness. The current version runs a minimal agent loop with in-memory session storage, mock and OpenAI-compatible model providers, MCP HTTP tool adapters, task orchestration, tool registration, security checks, structured tool logs, and configurable context assembly.

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
src/memory/        In-memory message store, context builder, summarizer
src/mcp/           HTTP MCP client, discovery, tool adapter
src/models/        Mock provider, OpenAI provider, parser, quality gate
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
- ContextBuilder
- SimpleSummarizer
- MockProvider
- OpenAIProvider
- OpenAI Responses API parser
- Model output quality gate
- HttpMcpClient
- discoverMcpTools
- McpToolAdapter
- SimplePlanner
- TaskGraph
- TaskStateMachine
- Coordinator
- DefaultToolRegistry
- Engine main loop
- EchoTool
- SecurityGuard
- ToolExecutor
- Logger
- Basic tests

Not implemented yet:

- SQLite memory persistence
- MCP stdio transport, SSE streaming, initialization/session lifecycle
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

## MCP Integration

`HttpMcpClient` supports MCP tool discovery and tool calls over a Streamable HTTP-style endpoint. Tests use a mock `fetchFn`, so the normal test suite does not require a live MCP server.

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

The runtime still only sees `Tool` objects; MCP protocol details stay inside `src/mcp/`.

## Orchestration

The orchestration layer can split goals into tasks, validate task dependencies, run tasks in dependency order, retry failed tasks, downgrade blocked work to `skipped`, and dispatch work to role-specific handlers.

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
  handlers: {
    planner: async (task) => ({ result: `${task.title} done` }),
    builder: async (task) => ({ result: `${task.title} done` }),
  },
});

await coordinator.run(tasks);
```
