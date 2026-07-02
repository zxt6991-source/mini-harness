# MiniHarness 生产可用 P1 HTTP 服务入口实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 实现 `docs/生产可用升级技术实现文档.md` 中 P1 的最小服务入口：HTTP JSON run、SSE event stream、health、ready、metrics 和优雅关闭 helper。

**架构：** 新增 `src/server/http.ts` 提供无依赖的 fetch-style handler 和 Node `http.Server` 适配器；新增 `src/server/graceful-shutdown.ts` 管理 server close、运行中请求计数和 shutdown timeout。服务层只依赖 P0 的 `MiniHarnessInstance`，不改变 `Engine`、`Memory`、`ToolRegistry` 的核心协议。

**技术栈：** TypeScript、Node `http`、Web `Request`/`Response`、Vitest、现有 `createHarness` 和 `Engine.runEvents()`。

---

### Task 1: HTTP JSON 与 SSE 路由

**Files:**
- Create: `src/server/http.ts`
- Modify: `src/index.ts`
- Test: `tests/http-server.test.ts`
- Test: `tests/exports.test.ts`

- [x] **Step 1: 写失败测试**

测试 `POST /v1/runs` 返回 assistant message，`POST /v1/runs/stream` 返回 `text/event-stream`，并包含 `agent_start` 与 `agent_end` 事件。

Run: `pnpm test tests/http-server.test.ts tests/exports.test.ts`
Expected: FAIL，因为 `createMiniHarnessFetchHandler` 尚不存在。

- [x] **Step 2: 实现最小 handler**

`createMiniHarnessFetchHandler(harness)` 返回 `(request: Request) => Promise<Response>`，支持：

- `POST /v1/runs`
- `POST /v1/runs/stream`
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

- [x] **Step 3: 导出 API**

在 `src/index.ts` 导出 `./server/http`。

- [x] **Step 4: 跑定向测试**

Run: `pnpm test tests/http-server.test.ts tests/exports.test.ts`
Expected: PASS。

### Task 2: health、ready、metrics 语义

**Files:**
- Modify: `src/server/http.ts`
- Test: `tests/http-server.test.ts`

- [x] **Step 1: 补测试**

验证：

- `GET /healthz` 返回 `{ status: "ok" }`。
- `GET /readyz` 返回 registered tool count、provider、memory 状态。
- `GET /metrics` 返回 `ProductionMetricsSnapshot`。
- 错误 JSON body 返回 400。
- 未知路径返回 404。

- [x] **Step 2: 实现状态响应**

状态响应使用稳定 JSON 结构，方便后续接入 load balancer 和控制面。

- [x] **Step 3: 跑定向测试**

Run: `pnpm test tests/http-server.test.ts`
Expected: PASS。

### Task 3: 优雅关闭 helper

**Files:**
- Create: `src/server/graceful-shutdown.ts`
- Modify: `src/index.ts`
- Test: `tests/graceful-shutdown.test.ts`
- Test: `tests/exports.test.ts`

- [x] **Step 1: 写失败测试**

验证 `createGracefulShutdownController()` 可以跟踪运行中任务，调用 `shutdown()` 后等待任务完成，超时则调用可选 `onTimeout`。

- [x] **Step 2: 实现 helper**

提供：

- `track<T>(operation: Promise<T>): Promise<T>`
- `shutdown(): Promise<void>`
- `activeCount(): number`

- [x] **Step 3: 导出 API 并跑测试**

Run: `pnpm test tests/graceful-shutdown.test.ts tests/exports.test.ts`
Expected: PASS。

### Task 4: 全量验证

**Files:**
- Verify only.

- [x] **Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: PASS。

- [x] **Step 2: 全量测试**

Run: `pnpm test`
Expected: PASS。

- [x] **Step 3: 构建**

Run: `pnpm build`
Expected: PASS。

- [x] **Step 4: mock smoke**

Run: `pnpm smoke:mock`
Expected: PASS。
