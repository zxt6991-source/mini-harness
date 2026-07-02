// 该文件提供生产装配入口，供 SDK 调用方、CLI demo 和后续服务入口复用。
import type { Memory, ModelProvider } from '../core';
import { createMemory } from '../memory/factory';
import { ModelOutputGovernance } from '../models/output-governance';
import { createModelProvider } from '../models/provider-factory';
import {
  FileCheckpointStore,
  InMemoryCheckpointStore,
  type CheckpointStore,
} from '../orchestration/checkpoint';
import { FeatureGateEvaluator } from '../production/feature-gates';
import { ProductionMetricsCollector } from '../production/metrics';
import {
  PersistentToolSchemaCache,
  ToolSchemaCache,
} from '../production/schema-cache';
import { Engine } from '../runtime/engine';
import { SecurityGuard } from '../security/guard';
import { ToolExecutor } from '../tools/executor';
import { DefaultToolRegistry } from '../tools/registry';
import type { HarnessConfig } from '../utils/config';

export interface MiniHarnessInstance {
  config: HarnessConfig;
  featureGates: FeatureGateEvaluator;
  model: ModelProvider;
  memory: Memory;
  securityGuard: SecurityGuard;
  toolExecutor: ToolExecutor;
  tools: DefaultToolRegistry;
  schemaCache?: ToolSchemaCache;
  checkpointStore?: CheckpointStore;
  metrics?: ProductionMetricsCollector;
  engine: Engine;
}

function createSchemaCache(config: HarnessConfig): ToolSchemaCache | false {
  const featureGates = new FeatureGateEvaluator(config.production.featureGates);
  if (
    !config.production.schemaCache.enabled ||
    !featureGates.isEnabled('schemaCache')
  ) {
    return false;
  }

  if (config.production.schemaCache.store === 'json') {
    return new PersistentToolSchemaCache({
      rootDir: config.production.schemaCache.rootDir,
      maxEntries: config.production.schemaCache.maxEntries,
    });
  }

  return new ToolSchemaCache({
    maxEntries: config.production.schemaCache.maxEntries,
  });
}

function createCheckpointStore(config: HarnessConfig): CheckpointStore | undefined {
  if (!config.orchestration.checkpoint.enabled) {
    return undefined;
  }

  if (config.orchestration.checkpoint.store === 'jsonl') {
    return new FileCheckpointStore({
      rootDir: config.orchestration.checkpoint.rootDir,
    });
  }

  return new InMemoryCheckpointStore();
}

/** 按统一生产装配规则创建 MiniHarness 运行实例。 */
export function createHarness(config: HarnessConfig): MiniHarnessInstance {
  const featureGates = new FeatureGateEvaluator(config.production.featureGates);
  const model = createModelProvider(config);
  const memory = createMemory(config.memory);
  const securityGuard = new SecurityGuard(config.security);
  const toolExecutor = new ToolExecutor(securityGuard);
  const schemaCache = createSchemaCache(config);
  const checkpointStore = createCheckpointStore(config);
  const metrics =
    config.production.metrics.enabled && featureGates.isEnabled('metrics')
      ? new ProductionMetricsCollector({
          latencyWarningMs: config.production.metrics.latencyWarningMs,
          errorRateWarningThreshold:
            config.production.metrics.errorRateWarningThreshold,
        })
      : undefined;
  const tools = new DefaultToolRegistry(toolExecutor, { schemaCache });

  const engine = new Engine(model, memory, tools, {
    maxSteps: config.runtime.maxSteps,
    requestTimeoutMs: config.runtime.requestTimeoutMs,
    enableStream: config.runtime.enableStream,
    maxConcurrentTools: config.runtime.maxConcurrentTools,
    toolErrorMode: config.runtime.toolErrorMode,
    toolTimeoutMs: config.runtime.toolTimeoutMs,
    modelRetry: config.runtime.modelRetry,
    budget: config.runtime.budget,
    drift: config.runtime.drift,
    outputGovernance: new ModelOutputGovernance(tools, config.outputGovernance),
    metrics,
  });

  return {
    config,
    featureGates,
    model,
    memory,
    securityGuard,
    toolExecutor,
    tools,
    schemaCache: schemaCache === false ? undefined : schemaCache,
    checkpointStore,
    metrics,
    engine,
  };
}
