import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  Engine,
  FileCheckpointStore,
  InMemoryStore,
  PersistentToolSchemaCache,
  ProductionMetricsCollector,
  createHarness,
  loadHarnessConfig,
} from '../src';
import { EchoTool } from '../src/tools/builtin/echo';

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

  it('assembles file checkpoint store and persistent schema cache from config', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'miniharness-factory-persistence-'));
    const config = await loadHarnessConfig('configs/harness.yaml', {
      envPath: false,
    });
    const harness = createHarness({
      ...config,
      model: { ...config.model, provider: 'mock' },
      memory: { ...config.memory, type: 'in-memory' },
      orchestration: {
        ...config.orchestration,
        checkpoint: {
          ...config.orchestration.checkpoint,
          store: 'jsonl',
          rootDir: join(rootDir, 'checkpoints'),
        },
      },
      production: {
        ...config.production,
        schemaCache: {
          ...config.production.schemaCache,
          store: 'json',
          rootDir: join(rootDir, 'schema-cache'),
        },
      },
    });

    expect(harness.checkpointStore).toBeInstanceOf(FileCheckpointStore);
    expect(harness.schemaCache).toBeInstanceOf(PersistentToolSchemaCache);

    harness.tools.register(new EchoTool());

    const restored = new PersistentToolSchemaCache({
      rootDir: join(rootDir, 'schema-cache'),
      maxEntries: 1000,
    });
    expect(restored.stats()).toMatchObject({
      entries: 1,
      hits: 1,
    });
  });
});
