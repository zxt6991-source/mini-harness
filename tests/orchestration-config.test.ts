import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHarnessConfig } from '../src/utils/config';

describe('orchestration config', () => {
  it('loads runtime retry jitter ratio', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-runtime-retry-config-'));
    const configPath = join(dir, 'harness.yaml');
    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
  modelRetry:
    maxRetries: 2
    initialBackoffMs: 100
    maxBackoffMs: 1000
    jitterRatio: 0.25
model:
  provider: mock
`,
    );

    const config = await loadHarnessConfig(configPath);

    expect(config.runtime.modelRetry).toMatchObject({
      maxRetries: 2,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
      jitterRatio: 0.25,
    });
  });

  it('loads orchestration defaults and normalizes legacy enable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-orchestration-config-'));
    const configPath = join(dir, 'harness.yaml');
    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
model:
  provider: mock
orchestration:
  enable: true
  maxRetries: 2
`,
    );

    const config = await loadHarnessConfig(configPath);

    expect(config.orchestration).toMatchObject({
      enabled: true,
      defaultRole: 'default',
      maxRetries: 2,
      continueOnFailure: true,
      maxConcurrentTasks: 1,
      defaultTaskTimeoutMs: 300000,
      retry: {
        initialBackoffMs: 250,
        maxBackoffMs: 5000,
      },
      checkpoint: {
        enabled: true,
        store: 'memory',
        rootDir: '.miniharness/orchestration/checkpoints',
      },
      messages: {
        maxQueueSize: 1000,
        requireAckByDefault: false,
      },
      scratchpad: {
        maxEntries: 1000,
        maxValueCharacters: 20000,
      },
    });
  });

  it('loads file persistence settings for checkpoints and schema cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-persistence-config-'));
    const configPath = join(dir, 'harness.yaml');
    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
model:
  provider: mock
orchestration:
  checkpoint:
    enabled: true
    store: jsonl
    rootDir: .miniharness/test-checkpoints
production:
  schemaCache:
    enabled: true
    store: json
    rootDir: .miniharness/test-schema-cache
`,
    );

    const config = await loadHarnessConfig(configPath);

    expect(config.orchestration.checkpoint).toMatchObject({
      enabled: true,
      store: 'jsonl',
      rootDir: '.miniharness/test-checkpoints',
    });
    expect(config.production.schemaCache).toMatchObject({
      enabled: true,
      store: 'json',
      rootDir: '.miniharness/test-schema-cache',
    });
  });
});
