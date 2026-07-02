# MiniHarness 生产可用 P2 持久化与恢复实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 在不引入新数据库依赖的前提下，补齐 P2 的最小持久化恢复闭环：文件 checkpoint store、schema cache snapshot/hydrate、生产装配接线和恢复测试。

**架构：** `CheckpointStore` 增加文件实现，使用每个 workflowRunId 一个 JSON 文件保存最新 checkpoint；`ToolSchemaCache` 增加 snapshot/hydrate，并提供自动落盘的 `PersistentToolSchemaCache`。`createHarness(config)` 根据配置创建 `checkpointStore` 与 `schemaCache`，让上层服务或后续编排入口可复用。

**技术栈：** TypeScript、Node `fs/promises` 与同步小文件读写、Vitest、现有 `CheckpointStore`、`ToolSchemaCache`、`DefaultToolRegistry`。

---

### Task 1: 文件 checkpoint store

**Files:**
- Modify: `src/orchestration/checkpoint.ts`
- Test: `tests/orchestration-checkpoint.test.ts`
- Test: `tests/exports.test.ts`

- [x] **Step 1: 写失败测试**

验证 `FileCheckpointStore` 在一个实例保存 checkpoint 后，另一个新实例能从同一目录加载。

Run: `pnpm test tests/orchestration-checkpoint.test.ts tests/exports.test.ts`
Expected: FAIL，因为 `FileCheckpointStore` 尚未实现和导出。

- [x] **Step 2: 实现 `FileCheckpointStore`**

实现：

- `constructor({ rootDir })`
- `save(checkpoint)`
- `load(workflowRunId)`

文件名使用安全字符归一化，写入使用 temp file + rename。

- [x] **Step 3: 跑定向测试**

Run: `pnpm test tests/orchestration-checkpoint.test.ts tests/exports.test.ts`
Expected: PASS。

### Task 2: schema cache snapshot/hydrate 与文件持久化

**Files:**
- Modify: `src/production/schema-cache.ts`
- Test: `tests/production-schema-cache.test.ts`

- [x] **Step 1: 写失败测试**

验证：

- `ToolSchemaCache.snapshot()` 能导出 entries。
- `ToolSchemaCache.hydrate(snapshot)` 能恢复 hash、hits、stats。
- `PersistentToolSchemaCache` 能跨实例恢复。

- [x] **Step 2: 实现 snapshot/hydrate**

保持现有 `remember()` API 兼容。

- [x] **Step 3: 实现 `PersistentToolSchemaCache`**

每次 `remember()` 后同步写入 JSON snapshot。小文件、低频注册工具场景可以接受。

- [x] **Step 4: 跑定向测试**

Run: `pnpm test tests/production-schema-cache.test.ts`
Expected: PASS。

### Task 3: createHarness/config 接线

**Files:**
- Modify: `src/utils/config.ts`
- Modify: `configs/harness.yaml`
- Modify: `src/app/create-harness.ts`
- Test: `tests/harness-factory.test.ts`
- Test: `tests/orchestration-config.test.ts`

- [x] **Step 1: 写失败测试**

验证：

- `createHarness(config).checkpointStore` 根据 `orchestration.checkpoint.store` 创建 `FileCheckpointStore`。
- `createHarness(config).schemaCache` 使用配置的 schema cache store。
- 配置 schema 接受 `production.schemaCache.store` 和 `rootDir`。

- [x] **Step 2: 修改配置 schema**

为 `production.schemaCache` 增加：

- `store: 'memory' | 'json'`
- `rootDir: string`

- [x] **Step 3: 修改 createHarness**

返回新增字段：

- `schemaCache?: ToolSchemaCache`
- `checkpointStore?: CheckpointStore`

- [x] **Step 4: 跑定向测试**

Run: `pnpm test tests/harness-factory.test.ts tests/orchestration-config.test.ts`
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
