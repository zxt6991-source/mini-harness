# MiniHarness 生产可用 P0 实现计划

> **给执行型 agent 的要求：** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 实现 `docs/生产可用升级技术实现文档.md` 中 P0 的最小代码闭环：统一生产装配入口、复用 demo 入口、补公共导出和测试。

**架构：** 新增 `src/app/create-harness.ts` 作为 SDK 和未来服务入口共享的装配层。它读取已解析的 `HarnessConfig`，创建 feature gates、model、memory、tools、security、metrics、output governance 和 `Engine`，返回可被业务调用方复用的组件集合。

**技术栈：** TypeScript、Vitest、现有 `Engine`、`createModelProvider`、`createMemory`、`DefaultToolRegistry`、`SecurityGuard`、`ToolExecutor`、`ProductionMetricsCollector`。

---

### Task 1: createHarness 公共 API

**Files:**
- Create: `src/app/create-harness.ts`
- Modify: `src/index.ts`
- Test: `tests/harness-factory.test.ts`
- Test: `tests/exports.test.ts`

- [x] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  Engine,
  InMemoryStore,
  ProductionMetricsCollector,
  createHarness,
  loadHarnessConfig,
} from '../src';

describe('createHarness', () => {
  it('assembles engine, memory, tools and metrics from config', async () => {
    const config = await loadHarnessConfig('configs/harness.yaml', {
      envPath: false,
    });
    const harness = createHarness({
      ...config,
      model: { ...config.model, provider: 'mock' },
      memory: { ...config.memory, type: 'in-memory' },
    });

    expect(harness.engine).toBeInstanceOf(Engine);
    expect(harness.memory).toBeInstanceOf(InMemoryStore);
    expect(harness.metrics).toBeInstanceOf(ProductionMetricsCollector);
    expect(harness.tools.listCapabilities()).toEqual([]);
    expect(harness.config.production.environment).toBe('development');
  });
});
```

Run: `pnpm test tests/harness-factory.test.ts tests/exports.test.ts`
Expected: FAIL，因为 `createHarness` 尚未导出。

- [x] **Step 2: 实现最小装配**

`createHarness()` 创建并返回：

```ts
{
  config,
  featureGates,
  model,
  memory,
  tools,
  metrics,
  engine,
}
```

其中 `metrics` 只有在 `production.metrics.enabled` 且 feature gate `metrics` 开启时创建。

- [x] **Step 3: 导出 API**

在 `src/index.ts` 增加：

```ts
export * from './app/create-harness';
```

- [x] **Step 4: 跑测试**

Run: `pnpm test tests/harness-factory.test.ts tests/exports.test.ts`
Expected: PASS。

### Task 2: main.ts 复用装配入口

**Files:**
- Modify: `src/main.ts`
- Test: `tests/harness-factory.test.ts`

- [x] **Step 1: 扩展测试保护可运行行为**

在 `tests/harness-factory.test.ts` 增加：

```ts
it('runs a mock request through the assembled engine', async () => {
  const config = await loadHarnessConfig('configs/harness.yaml', {
    envPath: false,
  });
  const harness = createHarness({
    ...config,
    model: { ...config.model, provider: 'mock' },
    memory: { ...config.memory, type: 'in-memory' },
  });

  const message = await harness.engine.run('hello', 'factory-test-session');

  expect(message.role).toBe('assistant');
  expect(message.content).toBe('Mock response: hello');
});
```

Run: `pnpm test tests/harness-factory.test.ts`
Expected: PASS，证明 factory 装配出的 engine 可执行。

- [x] **Step 2: 精简 main.ts**

`src/main.ts` 只负责加载配置、调用 `createHarness(config)`、运行 demo input 并输出内容。

- [x] **Step 3: 跑定向测试**

Run: `pnpm test tests/harness-factory.test.ts`
Expected: PASS。

### Task 3: 回归验证

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
