# MiniHarness MVP 实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**目标：** 构建一个可测试、可运行的 MiniHarness TypeScript MVP，跑通 Mock 模型主链路，并补齐基础工具执行、安全守卫和日志。

**架构：** `core/` 定义稳定接口，`runtime/` 实现 Agent 主循环，`memory/`、`models/`、`tools/` 通过接口注入。工具执行由 `ToolExecutor` 统一处理权限和日志，`DefaultToolRegistry` 保持工具注册与调用入口。

**技术栈：** TypeScript、Node.js 20+、pnpm、Vitest、tsup、nanoid、pino、zod、yaml、undici。

---

## 文件结构

- Create: `package.json`、`tsconfig.json`、`tsup.config.ts`
- Create: `src/core/message.ts`、`src/core/tool.ts`、`src/core/model.ts`、`src/core/memory.ts`、`src/core/errors.ts`、`src/core/index.ts`
- Create: `src/utils/id.ts`
- Create: `src/memory/local-store.ts`
- Create: `src/models/mock-provider.ts`
- Create: `src/tools/registry.ts`、`src/tools/executor.ts`、`src/tools/builtin/echo.ts`
- Create: `src/security/policy.ts`、`src/security/path.ts`、`src/security/guard.ts`
- Create: `src/reliability/logger.ts`
- Create: `src/runtime/engine.ts`
- Create: `src/main.ts`、`src/index.ts`
- Create: `configs/harness.yaml`
- Create: `examples/simple-agent/README.md`、`examples/tool-call/README.md`、`examples/mcp-demo/README.md`
- Create: `tests/*.test.ts`
- Modify: `MiniHarness_TS_实现步骤文档.md`

### Task 1: 工程骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `configs/harness.yaml`

- [x] **Step 1: 写入工程配置**

写入 `package.json` 脚本：`dev`、`build`、`test`、`typecheck`。

- [x] **Step 2: 运行安装**

Run: `pnpm install`
Expected: 依赖安装成功并生成 lockfile。

### Task 2: core 接口和 id helper

**Files:**
- Create: `src/core/*.ts`
- Create: `src/utils/id.ts`
- Test: `tests/core.test.ts`

- [x] **Step 1: 写失败测试**

测试 `MiniHarnessError` code、`ToolNotFoundError` code、`createId` prefix。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm test tests/core.test.ts`
Expected: FAIL because files are missing.

- [x] **Step 3: 实现 core 和 id helper**

按技术方案定义 `Message`、`Tool`、`ModelProvider`、`Memory`、错误类型和 `createId`。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm test tests/core.test.ts`
Expected: PASS.

### Task 3: Memory 和 MockProvider

**Files:**
- Create: `src/memory/local-store.ts`
- Create: `src/models/mock-provider.ts`
- Test: `tests/memory.test.ts`
- Test: `tests/mock-provider.test.ts`

- [x] **Step 1: 写失败测试**

测试 session 隔离、recent limit、search、buildContext，以及 MockProvider 回显最后一条消息。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm test tests/memory.test.ts tests/mock-provider.test.ts`
Expected: FAIL because implementations are missing.

- [x] **Step 3: 实现最小代码**

实现 `InMemoryStore` 和 `MockProvider`。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm test tests/memory.test.ts tests/mock-provider.test.ts`
Expected: PASS.

### Task 4: Registry、EchoTool、安全和执行器

**Files:**
- Create: `src/tools/registry.ts`
- Create: `src/tools/executor.ts`
- Create: `src/tools/builtin/echo.ts`
- Create: `src/security/policy.ts`
- Create: `src/security/path.ts`
- Create: `src/security/guard.ts`
- Create: `src/reliability/logger.ts`
- Test: `tests/tool.test.ts`
- Test: `tests/security.test.ts`

- [x] **Step 1: 写失败测试**

测试工具注册、重复注册、工具不存在、EchoTool、denyTools、allowTools、sandbox path 和 ToolExecutor 日志前权限调用。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm test tests/tool.test.ts tests/security.test.ts`
Expected: FAIL because implementations are missing.

- [x] **Step 3: 实现工具和安全代码**

实现 `DefaultToolRegistry`、`EchoTool`、`SecurityGuard`、`validateSandboxPath`、`logger`、`ToolExecutor`。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm test tests/tool.test.ts tests/security.test.ts`
Expected: PASS.

### Task 5: Engine、入口和导出

**Files:**
- Create: `src/runtime/engine.ts`
- Create: `src/main.ts`
- Create: `src/index.ts`
- Test: `tests/runtime.test.ts`

- [x] **Step 1: 写失败测试**

测试普通输入输出、工具调用循环、工具不存在、maxSteps。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm test tests/runtime.test.ts`
Expected: FAIL because Engine is missing.

- [x] **Step 3: 实现 Engine 和入口**

实现主循环、toolCalls 执行、最终 assistant 返回、入口示例和统一导出。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm test tests/runtime.test.ts`
Expected: PASS.

### Task 6: 文档标注和最终验证

**Files:**
- Modify: `MiniHarness_TS_实现步骤文档.md`
- Create: `README.md`

- [x] **Step 1: 标注步骤文档**

在已完成章节下追加 `状态：已完成`，未实现的真实模型、MCP、编排保留未标注。

- [x] **Step 2: 运行完整验证**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

Run: `pnpm dev`
Expected: 输出 `Mock response: 帮我分析一下当前项目结构`。

## 自检

- 覆盖范围：MVP 步骤 1-19 已映射到任务 1-6。
- 范围控制：第三阶段到第五阶段不在本轮实现。
- 类型一致性：所有模块通过 `src/core/index.ts` 暴露统一类型。
- git：当前目录不是 git 仓库，不执行提交步骤。
