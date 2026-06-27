# MiniHarness 第三阶段实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**目标：** 实现第三阶段真实模型接入和 Memory 增强，并通过本地 mock 测试验证 OpenAI Provider、tool_call、错误处理和上下文管理。

**架构：** `models/` 新增 OpenAI 协议适配、解析和质量门控；`memory/` 新增可组合的上下文构建器和摘要器；`runtime/` 只给模型调用补充 trace/session metadata，不引入 OpenAI 专有逻辑。

**技术栈：** TypeScript、Vitest、Node fetch、AbortController、OpenAI Responses API。

---

## 文件结构

- Create: `src/models/openai-provider.ts`
- Create: `src/models/parser.ts`
- Create: `src/models/quality-gate.ts`
- Create: `src/memory/context-builder.ts`
- Create: `src/memory/summarizer.ts`
- Modify: `src/core/model.ts`
- Modify: `src/core/errors.ts`
- Modify: `src/memory/local-store.ts`
- Modify: `src/runtime/engine.ts`
- Modify: `src/index.ts`
- Modify: `configs/harness.yaml`
- Modify: `README.md`
- Modify: `MiniHarness_TS_实现步骤文档.md`
- Test: `tests/openai-provider.test.ts`
- Test: `tests/parser.test.ts`
- Test: `tests/context-builder.test.ts`
- Test: `tests/runtime.test.ts`

### Task 1: 模型错误与输入 metadata

**Files:**
- Modify: `src/core/model.ts`
- Modify: `src/core/errors.ts`
- Test: `tests/core.test.ts`

- [x] **Step 1: 写失败测试**

测试 `ModelProviderError` 的 `code`、`status`、`retryable`，以及 `ModelChatInput.metadata` 可携带 `traceId`、`sessionId`。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/core.test.ts`
Expected: FAIL because `ModelProviderError` and metadata are missing.

- [x] **Step 3: 实现最小代码**

新增 `ModelProviderError`，给 `ModelChatInput` 增加 `metadata?: Record<string, unknown>`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/core.test.ts`
Expected: PASS.

### Task 2: Responses API parser 和质量门控

**Files:**
- Create: `src/models/parser.ts`
- Create: `src/models/quality-gate.ts`
- Test: `tests/parser.test.ts`

- [x] **Step 1: 写失败测试**

测试普通 assistant 文本、多个文本片段合并、`function_call` JSON 参数解析、usage 映射、非法 JSON 报错、空响应报错。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/parser.test.ts`
Expected: FAIL because parser files are missing.

- [x] **Step 3: 实现最小代码**

实现 `parseOpenAIResponse()` 和 `ensureModelOutput()`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/parser.test.ts`
Expected: PASS.

### Task 3: OpenAIProvider

**Files:**
- Create: `src/models/openai-provider.ts`
- Test: `tests/openai-provider.test.ts`

- [x] **Step 1: 写失败测试**

测试请求 body、Authorization header、tools 转换、超时 signal、普通文本响应、tool_call 响应、缺 API key、401、429、5xx、网络错误。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/openai-provider.test.ts`
Expected: FAIL because provider is missing.

- [x] **Step 3: 实现最小代码**

实现 `OpenAIProvider`，使用可注入 `fetchFn`，默认读取 `OPENAI_API_KEY`，并复用 parser。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/openai-provider.test.ts`
Expected: PASS.

### Task 4: Memory ContextBuilder 和 Summarizer

**Files:**
- Create: `src/memory/context-builder.ts`
- Create: `src/memory/summarizer.ts`
- Modify: `src/memory/local-store.ts`
- Test: `tests/context-builder.test.ts`
- Test: `tests/memory.test.ts`

- [x] **Step 1: 写失败测试**

测试上下文顺序、recentLimit、searchTopK、摘要插入、字符裁剪、多 session 隔离和默认 `InMemoryStore` 兼容行为。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/context-builder.test.ts tests/memory.test.ts`
Expected: FAIL because context builder and summarizer are missing.

- [x] **Step 3: 实现最小代码**

实现 `SimpleSummarizer`、`ContextBuilder`，并让 `InMemoryStore` 可选接收 builder。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/context-builder.test.ts tests/memory.test.ts`
Expected: PASS.

### Task 5: Runtime metadata 和 OpenAI 风格集成

**Files:**
- Modify: `src/runtime/engine.ts`
- Test: `tests/runtime.test.ts`

- [x] **Step 1: 写失败测试**

测试 `Engine` 调用模型时传入 `metadata.traceId` 和 `metadata.sessionId`，并继续支持 tool_call 循环。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/runtime.test.ts`
Expected: FAIL because metadata is not passed.

- [x] **Step 3: 实现最小代码**

在 `Engine.run()` 调用 `model.chat()` 时传入 metadata。

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

导出第三阶段新模块，配置中加入 OpenAI 默认项和 memory context 参数。

- [x] **Step 2: 更新步骤文档**

把 18、20 中已完成的验收项标为已完成；19 中 context-builder、summarizer 标为已完成，SQLite 标为后续增强。

- [x] **Step 3: 运行完整验证**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

## 自检

- 第三阶段 OpenAIProvider、parser、quality-gate、context-builder、summarizer 均有任务覆盖。
- SQLite 持久化不在本轮范围，已在 spec 中明确为后续增强。
- `runtime/` 不会引入 OpenAI 专有类型或接口。
- 当前目录不是 git 仓库，不执行提交步骤。
