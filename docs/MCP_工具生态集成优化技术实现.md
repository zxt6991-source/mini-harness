# MCP 与工具生态集成优化技术实现

## 背景

本方案基于 `/Users/jojo/Desktop/all-agent/harness_engineering_guide/09_mcp` 中的 MCP 指南，并结合当前 MiniHarness TypeScript 项目的实际代码边界制定。当前项目已经具备：

- `HttpMcpClient`：通过 HTTP JSON-RPC 调用 `tools/list` 与 `tools/call`。
- `discoverMcpTools`：分页发现 MCP 工具并转换为内部 `Tool`。
- `McpToolAdapter`：把 MCP tool result 转换为内部 `ToolResult`。
- `DefaultToolRegistry` 与 `ToolExecutor`：统一注册、校验、权限检查、超时和日志。

因此本轮优化采用“增强现有 MCP 适配层”的方式，而不是另起一套 MCP registry 或运行时分支。

## 目标

1. 补齐 MCP 生命周期握手：支持 `initialize` 与 `notifications/initialized`，并在发现工具前完成初始化。
2. 改进 Streamable HTTP 兼容性：同一个 HTTP endpoint 支持 `application/json` 与 `text/event-stream` 响应解析。
3. 增加发现缓存：避免短时间内重复调用 `tools/list`，降低工具生态较大时的发现延迟和 token 描述成本。
4. 强化工具命名策略：将远端 MCP 工具名转换为内部安全工具名，同时保留原始 MCP 名称用于 `tools/call`、审计和调试。
5. 扩展 MCP 原语类型：为 resources/prompts 留出客户端 API 与协议类型，保持 runtime 仍只依赖内部 `Tool` 接口。
6. 更新主技术方案，明确 MCP 与工具生态的生产级集成路线。

## 非目标

- 本轮不实现 stdio 传输。指南建议本地工具优先 stdio，但当前项目已经以 HTTP MCP 为基础，stdio 应作为后续独立任务实现。
- 本轮不实现 OAuth/SSO 完整授权流程。当前只保留自定义 headers 注入与后续扩展点。
- 本轮不实现磁盘或 Redis schema 缓存。先提供进程内 TTL 缓存，接口保持可演进。
- 本轮不把 resources/prompts 注入 runtime 上下文。先补协议与客户端能力，避免一次性扩大 runtime 行为面。

## 设计方案

### 1. MCP 客户端生命周期

`HttpMcpClient` 增加 `initialize()`：

- 发送 JSON-RPC `initialize` 请求，包含 `protocolVersion`、`clientInfo` 与客户端 capabilities。
- 捕获响应头中的 `MCP-Session-Id`，后续请求自动携带。
- 初始化成功后发送 JSON-RPC notification `notifications/initialized`。
- 方法保持幂等，多次调用不会重复握手。

`discoverMcpTools()` 在发现工具前检查客户端是否提供 `initialize()`，如果存在则调用。这让普通调用方仍只需要 `discoverMcpTools(client)`。

### 2. Streamable HTTP 响应解析

`HttpMcpClient` 请求解析增加内容类型分支：

- `application/json`：按普通 JSON-RPC response 解析。
- `text/event-stream`：从 SSE 文本中提取 `data:` 行，解析 JSON，并按请求 id 找到对应响应。
- 未提供 `Content-Type` 的测试 mock 和旧实现仍走 JSON 解析路径。

这样可以兼容标准 Streamable HTTP 中“直接 JSON 响应”和“SSE 流式响应”两种返回形式。

### 3. 工具发现缓存

`discoverMcpTools()` 增加进程内 TTL 缓存：

- 缓存 key 使用 `McpClient` 对象引用。
- 缓存值保存原始 `McpTool[]` 与过期时间。
- 默认 TTL 为 5 分钟，可通过 `cacheTtlMs` 调整，`forceRefresh` 可强制重新发现。
- 缓存的是 MCP 原始工具定义，调用时仍按当前 `McpToolAdapterOptions` 生成内部工具名和能力描述。

该策略对应指南中的 L1 内存缓存，后续可扩展到磁盘缓存和工具列表变更通知。

### 4. 内部工具命名与元数据

`McpToolAdapter` 的内部名称统一走安全转换：

- 只保留 `A-Z`、`a-z`、`0-9`、`_`、`-`。
- 支持可选 `namePrefix` 避免多 server 同名工具冲突。
- 内部名称最长 64 个字符，超长时用稳定 hash 后缀截断。
- `metadata` 中保留 `mcpServerName`、`mcpToolName`、`mcpOriginalName`，远端调用仍使用原始 MCP tool name。

这样可以满足 `DefaultToolRegistry` 的工具名约束，同时不破坏远端协议调用。

### 5. Resources 与 Prompts 扩展点

协议层和客户端补充以下 API：

- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

本轮只提供类型和客户端方法，不改变 runtime 主链路。未来可以通过 context builder 或 orchestration 把资源读取和 prompt 模板纳入工作流。

## 测试策略

新增或扩展以下测试：

- `tests/mcp-client.test.ts`
  - `initialize()` 发送握手请求和 initialized notification。
  - 后续请求携带 `MCP-Session-Id`。
  - `text/event-stream` 响应可被正确解析。
  - resources/prompts 客户端方法发出正确 JSON-RPC method。
- `tests/mcp-discovery.test.ts`
  - 重复发现命中 TTL 缓存，不重复请求 `tools/list`。
  - `forceRefresh` 可绕过缓存。
  - 发现前自动调用可选 `initialize()`。
- `tests/mcp-adapter.test.ts`
  - 不安全或超长 MCP 工具名转换为合法内部工具名。
  - 远端调用仍使用原始 MCP 工具名。

验证命令：

```bash
pnpm test tests/mcp-client.test.ts tests/mcp-discovery.test.ts tests/mcp-adapter.test.ts
pnpm typecheck
pnpm build
```

## 后续路线

1. 增加 stdio transport 和本地进程生命周期管理。
2. 增加磁盘 schema cache，并支持工具列表 hash 或 `notifications/tools/list_changed` 失效。
3. 增加 MCP server config 的强类型校验和 server factory。
4. 将 resources/prompts 纳入上下文构建、任务编排和权限策略。
5. 实现 OAuth 2.1 / Protected Resource Metadata 的授权发现流程。
