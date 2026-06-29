import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadHarnessConfig } from '../src/utils/config';

describe('orchestration config', () => {
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
});
