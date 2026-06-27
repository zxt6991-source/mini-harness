# MiniHarness 第四阶段 MCP 集成设计

## 目标

按 `MiniHarness_TS_实现步骤文档.md` 的第四阶段实现 MCP 工具接入。目标链路是：

```text
MCP Server 工具
-> HttpMcpClient 发现
-> McpToolAdapter 转换
-> DefaultToolRegistry 注册
-> Engine 正常调用
```

`runtime/` 不感知 MCP 协议，所有 MCP 细节限定在 `src/mcp/`。

## 范围

本轮实现：

- `src/mcp/protocol.ts`：JSON-RPC、MCP 工具、工具调用结果、MCP 错误类型。
- `src/mcp/client.ts`：Streamable HTTP MCP Client，支持 `tools/list` 和 `tools/call`。
- `src/mcp/discovery.ts`：分页发现 MCP 工具，并转换成内部 `Tool[]`。
- `src/mcp/adapter.ts`：`McpToolAdapter` 实现 `core.Tool`。
- 配置、README、步骤文档更新。
- 测试覆盖：HTTP 请求格式、分页发现、工具调用、错误归一化、Adapter 内容规整、Registry/Engine 集成。

本轮不实现：

- stdio 传输。原因：需要子进程生命周期、stdout/stderr 协议隔离、启动安全策略，本轮先把 HTTP MCP 主链路跑通。
- MCP 初始化握手和 SSE 长连接消费。原因：当前步骤文档验收聚焦工具发现和调用；本轮保留协议版本 header，后续可扩展初始化和 session 管理。

## 协议设计

本阶段使用 MCP 2025-06-18 的 Streamable HTTP 思路：

- 请求使用 JSON-RPC 2.0。
- `tools/list` 用于发现工具，支持 `cursor` 分页。
- `tools/call` 用于调用工具，参数为 `{ name, arguments }`。
- HTTP 请求使用 `POST` 到单个 MCP endpoint。
- 请求 header 包含：
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
  - `MCP-Protocol-Version: 2025-06-18`
- 测试实现只要求 JSON 响应；SSE 响应解析留给后续增强。

## 模块边界

`HttpMcpClient` 只返回 MCP 原生结构：

- `listTools(cursor?) -> { tools, nextCursor }`
- `callTool({ name, arguments, traceId }) -> McpCallToolResult`

`McpToolAdapter` 负责把 MCP 工具转换为 `core.Tool`：

- `name` 使用 MCP tool name。
- `description` 优先 MCP description，缺失时使用 title/name。
- `schema` 使用 MCP `inputSchema`。
- `call()` 调用 `client.callTool()`，再把 MCP content 规整成 `ToolResult`。

`discoverMcpTools(client)` 负责拉取所有分页并返回 `McpToolAdapter[]`，调用方可直接注册到 `DefaultToolRegistry`。

## 错误处理

新增 `McpError`：

- HTTP 非 2xx -> `MCP_HTTP_ERROR`
- JSON-RPC error -> `MCP_RPC_ERROR`
- 响应缺 result -> `MCP_RESPONSE_INVALID`
- 网络异常 -> `MCP_NETWORK_ERROR`
- 超时 -> `MCP_TIMEOUT`
- MCP tool result `isError: true` -> Adapter 返回 `success: false`，不直接抛错，交由工具执行层记录结果。

`HttpMcpClient` 和 `McpToolAdapter` 在失败时记录 `traceId`、`toolName`、`serverName`、`latencyMs`、`errorCode`。

## 验收标准

- 可以配置 MCP HTTP endpoint。
- 可以通过 `tools/list` 发现 MCP 工具。
- 支持分页发现工具。
- MCP 工具可以转换成内部 `Tool`。
- MCP 工具可以注册进 `DefaultToolRegistry`。
- `Engine` 可以调用 MCP 工具并把结果回填。
- MCP 调用失败时有明确错误类型和日志。

## 约束

当前目录不是 git 仓库，因此不执行 git commit。若后续需要提交历史，应先由用户确认是否初始化 git。
