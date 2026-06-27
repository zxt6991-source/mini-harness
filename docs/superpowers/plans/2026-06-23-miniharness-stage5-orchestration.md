# MiniHarness 第五阶段编排引擎实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**目标：** 实现本地可测试的 orchestration 层，支持任务拆解、依赖图、状态机、重试/降级和多角色 handler 协作。

**架构：** `orchestration/` 独立于 `runtime/`。`Planner` 生成任务，`TaskGraph` 管依赖，`TaskStateMachine` 管状态，`Coordinator` 调度角色 handler 执行任务。

**技术栈：** TypeScript、Vitest、内存任务图。

---

## 文件结构

- Create: `src/orchestration/task.ts`
- Create: `src/orchestration/graph.ts`
- Create: `src/orchestration/state-machine.ts`
- Create: `src/orchestration/planner.ts`
- Create: `src/orchestration/coordinator.ts`
- Modify: `src/index.ts`
- Modify: `configs/harness.yaml`
- Modify: `README.md`
- Modify: `MiniHarness_TS_实现步骤文档.md`
- Test: `tests/orchestration.test.ts`

### Task 1: Task 类型和状态机

**Files:**
- Create: `src/orchestration/task.ts`
- Create: `src/orchestration/state-machine.ts`
- Test: `tests/orchestration.test.ts`

- [x] **Step 1: 写失败测试**

测试 TaskStatus、合法状态流转、非法状态流转抛错。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: FAIL because orchestration files are missing.

- [x] **Step 3: 实现最小代码**

定义 Task 类型和 `TaskStateMachine.transition()`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: PASS for state-machine tests.

### Task 2: TaskGraph

**Files:**
- Create: `src/orchestration/graph.ts`
- Test: `tests/orchestration.test.ts`

- [x] **Step 1: 写失败测试**

测试拓扑排序、缺失依赖、循环依赖、当前可运行任务。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: FAIL for graph tests.

- [x] **Step 3: 实现最小代码**

实现 `TaskGraph`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: PASS for graph tests.

### Task 3: Planner

**Files:**
- Create: `src/orchestration/planner.ts`
- Test: `tests/orchestration.test.ts`

- [x] **Step 1: 写失败测试**

测试单目标拆单任务、多 step 拆多任务、默认 role、dependsOn 保留。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: FAIL for planner tests.

- [x] **Step 3: 实现最小代码**

实现 `SimplePlanner.plan()`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: PASS for planner tests.

### Task 4: Coordinator

**Files:**
- Create: `src/orchestration/coordinator.ts`
- Test: `tests/orchestration.test.ts`

- [x] **Step 1: 写失败测试**

测试按依赖顺序执行、按 role 选择 handler、失败重试、失败降级 skipped。

- [x] **Step 2: 运行红灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: FAIL for coordinator tests.

- [x] **Step 3: 实现最小代码**

实现 `Coordinator.run()`。

- [x] **Step 4: 运行绿灯测试**

Run: `pnpm test tests/orchestration.test.ts`
Expected: PASS.

### Task 5: 导出、配置、文档和步骤标注

**Files:**
- Modify: `src/index.ts`
- Modify: `configs/harness.yaml`
- Modify: `README.md`
- Modify: `MiniHarness_TS_实现步骤文档.md`

- [x] **Step 1: 更新导出和配置**

导出 orchestration 模块，在配置中加入 orchestration 默认项。

- [x] **Step 2: 更新步骤文档**

把 25-27 已完成项标为已完成，注明真实多 Agent 进程/网络协作和持久化状态为后续增强。

- [x] **Step 3: 运行完整验证**

Run: `pnpm test`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

## 自检

- 第五阶段验收 1-5 均有测试覆盖。
- `runtime/` 不引入 orchestration 逻辑。
- 当前目录不是 git 仓库，不执行提交步骤。
