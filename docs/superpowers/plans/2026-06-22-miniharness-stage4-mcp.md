# MiniHarness 第四阶段 MCP 集成实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**目标：** 实现 HTTP MCP 工具发现、调用、内部 Tool 适配和 Engine 集成，并继续在步骤文档中标注完成项。

**架构：** `mcp/` 封装 JSON-RPC 与 HTTP MCP 协议；`McpToolAdapter` 把 MCP 工具转成 `core.Tool`；`runtime/` 不改 MCP 逻辑，只通过现有 `ToolRegistry` 调用工具。

**技术栈：** TypeScript、Vitest、Node fetch、JSON-RPC 2.0、MCP Streamable HTTP。

---

## 文件结构

- Create: `src/mcp/protocol.ts`
- Create: `src/mcp/client.ts`
- Create: `src/mcp/discovery.ts`
- Create: `src/mcp/adapter.ts`
- Modify: `src/index.ts`
- Modify: `configs/harness.yaml`
- Modify: `README.md`
- Modify: `MiniHarness_TS_实现步骤文档.md`
- Test: `tests/mcp-client.test.ts`
- Test: `tests/mcp-discovery.test.ts`
- Test: `tests/mcp-adapter.test.ts`
- Test: `tests/runtime.test.ts`

### Task 1: MCP 协议类型和错误

**Files:**
- Create: `src/mcp/protocol.ts`
- Test: `tests/mcp-client.test.ts`

- [x] **Step 1: 写失败测试**

测试 `McpError` 的 code、status、retryable，以及 JSON-RPC request 的基本形态。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/mcp-client.test.ts`
Expected: FAIL because `src/mcp/protocol.ts` is missing.

- [x] **Step 3: 实现最小代码**

定义 MCP 工具、content、result、JSON-RPC 请求/响应和 `McpError`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/mcp-client.test.ts`
Expected: PASS for protocol-only tests.

### Task 2: HttpMcpClient

**Files:**
- Create: `src/mcp/client.ts`
- Test: `tests/mcp-client.test.ts`

- [x] **Step 1: 写失败测试**

测试 `tools/list` 请求 body/header、`tools/call` 请求 body/header、HTTP 错误、JSON-RPC error、网络错误、超时 signal。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/mcp-client.test.ts`
Expected: FAIL because client implementation is missing.

- [x] **Step 3: 实现最小代码**

实现可注入 `fetchFn` 的 `HttpMcpClient`，默认协议版本 `2025-06-18`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/mcp-client.test.ts`
Expected: PASS.

### Task 3: Discovery

**Files:**
- Create: `src/mcp/discovery.ts`
- Test: `tests/mcp-discovery.test.ts`

- [x] **Step 1: 写失败测试**

测试分页拉取全部工具、空列表、转换成 `McpToolAdapter[]`。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/mcp-discovery.test.ts`
Expected: FAIL because discovery is missing.

- [x] **Step 3: 实现最小代码**

实现 `discoverMcpTools(client)`，循环 `nextCursor`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/mcp-discovery.test.ts`
Expected: PASS.

### Task 4: McpToolAdapter

**Files:**
- Create: `src/mcp/adapter.ts`
- Test: `tests/mcp-adapter.test.ts`

- [x] **Step 1: 写失败测试**

测试 MCP text/image/resource content 规整、`isError` 转为 `success: false`、metadata 保留 MCP content 和 toolName。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/mcp-adapter.test.ts`
Expected: FAIL because adapter is missing.

- [x] **Step 3: 实现最小代码**

实现 `McpToolAdapter`，内部调用 `client.callTool()`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/mcp-adapter.test.ts`
Expected: PASS.

### Task 5: Registry/Engine 集成

**Files:**
- Test: `tests/runtime.test.ts`

- [x] **Step 1: 写失败测试**

测试 `discoverMcpTools()` 返回的 adapter 注册到 `DefaultToolRegistry` 后，Engine 可以执行 MCP 工具并完成模型循环。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/runtime.test.ts`
Expected: FAIL before MCP modules exist.

- [x] **Step 3: 实现集成所需导出**

不改 `runtime/` MCP 逻辑，只通过 ToolRegistry 注册 adapter。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/runtime.test.ts`
Expected: PASS.

### Task 6: 导出、配置、文档和步骤标注

**Files:**
- Modify: `src/index.ts`
- Modify: `configs/harness.yaml`
- Modify: `README.md`
- Modify: `MiniHarness_TS_实现步骤文档.md`

- [x] **Step 1: 更新导出和配置**

导出 MCP 模块，在配置中加入 MCP endpoint 示例。

- [x] **Step 2: 更新步骤文档**

把 21-24 已完成项标为已完成，注明 stdio、SSE、初始化握手为后续增强。

- [x] **Step 3: 运行完整验证**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

## 自检

- 第四阶段文档要求的 `protocol.ts`、`client.ts`、`discovery.ts`、`adapter.ts` 均有任务覆盖。
- `runtime/` 不引入 MCP 协议逻辑。
- stdio 和 SSE 明确为后续增强。
- 当前目录不是 git 仓库，不执行提交步骤。
