# 生产级 Harness 构建优化技术实现

## 背景

本方案基于 `/Users/jojo/Desktop/all-agent/harness_engineering_guide/10_production` 目录中的第十章内容，并结合当前 MiniHarness TypeScript 项目的实际边界制定。第十章强调的生产化主题包括：

- 模块化系统提示词与稳定提示词前缀。
- Plugin / Skill / Hook / Command 分层扩展体系。
- Schema 缓存、提示词缓存、并发工具调用、模型路由和预算控制。
- 多环境配置、运行时 Feature Gates、灰度发布和回滚。
- 结构化日志、性能指标和生产部署检查清单。

当前仓库已经具备不少生产基础：`Engine.runEvents()` 事件流、运行时预算、工具并发调度、工具错误观察模式、MCP discovery TTL 缓存、provider fallback、结构化日志、记忆上下文裁剪和输出治理。因此本轮优化采用“增强现有横切能力”的方式，而不是引入重型插件市场、远端配置中心或完整灰度平台。

## 目标

1. 新增 `src/production/` 模块，集中承载生产配置、Feature Gates、提示词缓存元数据、Schema hash cache 和运行指标汇总。
2. 扩展配置系统，增加 `production` 配置段，并支持部分 `HARNESS_*` 环境变量覆盖。
3. 扩展 `ContextBuilder`，支持模块化系统提示词，在 system message metadata 中暴露稳定前缀 hash、静态/动态字符数和模块分布。
4. 扩展 `DefaultToolRegistry`，在注册工具时计算 schema hash 和 schema cache 统计，但不改变 provider 的 function tool 请求格式。
5. 扩展运行时指标接入点，让 `Engine` 可以把事件同步记录到可插拔 metrics sink。
6. 更新主技术方案文档，说明 MiniHarness 的生产级优化路线和本轮已落地能力。

## 非目标

- 本轮不实现完整插件市场、动态 npm/JS 插件加载或第三方 skill 注册中心。
- 本轮不把 tool schema 替换为占位符发送给 OpenAI / Chat Completions provider。Function calling 协议仍需要完整 schema，本轮只建立 hash/cache 元数据和统计能力。
- 本轮不接入 GrowthBook、Consul、Redis、OpenTelemetry collector 等外部服务。Feature Gates 与 metrics 先使用本地、可测试的 TypeScript 实现。
- 本轮不修改模型选择算法；已有 `ProviderRouter`、`CircuitBreaker` 和 reasoning budget 继续作为模型路由基础。

## 设计方案

### 1. 生产配置与 Feature Gates

新增生产配置段：

```yaml
production:
  environment: development
  featureGates:
    schemaCache: true
    modularPrompt: true
    metrics: true
  prompt:
    cacheBoundaryCharacters: 48000
    exposeMetadata: true
  schemaCache:
    enabled: true
    maxEntries: 1000
  metrics:
    enabled: true
    latencyWarningMs: 2000
    errorRateWarningThreshold: 0.01
```

`FeatureGateEvaluator` 支持三类规则：

- `boolean`：直接开关。
- `{ enabled, rolloutPercent }`：按 `userId/sessionId` 稳定 hash 灰度。
- `{ include, exclude }`：允许名单和拒绝名单覆盖。

配置加载顺序保持当前项目习惯：YAML 默认值 + `.env` 文件加载 + 显式环境变量覆盖。新增覆盖项保持少量且清晰：`HARNESS_ENVIRONMENT`、`HARNESS_FEATURE_<NAME>`、`HARNESS_METRICS_ENABLED`。

### 2. 模块化提示词与缓存元数据

新增 `ModularPromptBuilder`：

- 模块类型：`core_identity`、`capabilities`、`domain_knowledge`、`context_specific`。
- `cacheable: true` 的模块组成稳定前缀，按 priority 排序。
- `cacheable: false` 的模块组成动态尾部，支持 `{{input}}`、`{{sessionId}}` 等变量替换。
- 返回 `prompt` 和 `metadata`，metadata 包含 `cacheKey`、`staticCharacters`、`dynamicCharacters`、`cacheBoundaryCharacters`、`moduleBreakdown`。

`ContextBuilder` 新增 `systemPromptModules` 选项。当配置了模块化提示词时，第一条 system message 的 content 使用 builder 输出，metadata 写入提示词缓存信息；未配置时维持现有行为。

### 3. Tool Schema Hash Cache

新增 `ToolSchemaCache`：

- 对 normalized schema 做稳定 JSON 序列化。
- 使用 SHA-256 前 16 位作为 schema hash。
- 记录 schema 字符数、命中次数、首次注册时间和最近访问时间。
- 支持 `maxEntries`，超限时删除最早访问的条目。

`DefaultToolRegistry` 注册工具时会通过 cache 记录 schema，并把 `schemaHash`、`schemaCharacters` 写入 capability metadata。`list()` 返回的原始 `Tool[]` 不变，provider 仍发送完整 schema。

### 4. 运行指标汇总

新增 `ProductionMetricsCollector`：

- 直接消费 `EngineEvent`。
- 汇总模型调用次数、工具调用次数、成功/失败工具数、错误数、token 使用、平均/最大工具延迟、运行步数。
- 提供 `snapshot()` 给 UI、日志或控制面读取。

`EngineOptions` 增加可选 `metrics?: RuntimeMetricsSink`，所有运行时事件创建后同步写入 sink。默认不传 metrics 时行为不变。

### 5. 扩展体系取舍

第十章的 Plugin / Skill / Hook / Command 是长期生产架构方向。当前仓库已有 `ToolRegistry`、MCP adapter、orchestration events 和 runtime events，先不另建插件运行时。本轮只在文档中明确后续扩展边界：

- Skill 对应当前 `Tool` / MCP tool。
- Hook 对应后续可插入的 runtime/tool/model 事件 sink。
- Command 可在 CLI 或上层应用中映射到 orchestration workflow。
- Plugin manifest 和权限隔离作为后续独立任务实现。

## 文件变更

- 新增：`src/production/feature-gates.ts`
- 新增：`src/production/prompt.ts`
- 新增：`src/production/schema-cache.ts`
- 新增：`src/production/metrics.ts`
- 修改：`src/memory/context-builder.ts`
- 修改：`src/tools/registry.ts`
- 修改：`src/runtime/engine.ts`
- 修改：`src/utils/config.ts`
- 修改：`src/index.ts`
- 修改：`configs/harness.yaml`
- 新增测试：`tests/production-feature-gates.test.ts`
- 新增测试：`tests/production-prompt.test.ts`
- 新增测试：`tests/production-schema-cache.test.ts`
- 新增测试：`tests/production-metrics.test.ts`
- 更新：`MiniHarness_TS_技术方案.md`

## 测试策略

1. Feature Gates：验证布尔开关、环境覆盖、百分比灰度稳定性和 include/exclude 优先级。
2. 模块化提示词：验证模块排序、变量替换、cache key 稳定性、ContextBuilder metadata 注入。
3. Schema cache：验证相同 schema 产生相同 hash、重复注册命中、capability metadata 可见、超限淘汰。
4. Metrics：验证 Engine 事件能被 metrics sink 记录并生成 token、工具、错误、延迟汇总。
5. 回归验证：

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 交付结果

完成后，MiniHarness 会拥有一个保守但完整的生产化横切层：配置能控制生产开关，提示词和工具 schema 具备缓存感知元数据，运行时事件能沉淀为指标快照，同时保持现有 provider、MCP、tool 和 runtime 公共协议兼容。
