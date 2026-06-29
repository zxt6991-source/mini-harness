import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FeatureGateEvaluator } from '../src/production/feature-gates';
import { loadHarnessConfig } from '../src/utils/config';

describe('FeatureGateEvaluator', () => {
  it('evaluates boolean, rollout, include, and exclude rules', () => {
    const gates = new FeatureGateEvaluator({
      schemaCache: true,
      disabledFeature: false,
      canaryOn: { enabled: true, rolloutPercent: 100 },
      canaryOff: { enabled: true, rolloutPercent: 0 },
      denyUser: { enabled: true, exclude: ['user_1'] },
      allowUser: { enabled: false, include: ['user_2'] },
    });

    expect(gates.isEnabled('schemaCache')).toBe(true);
    expect(gates.isEnabled('disabledFeature')).toBe(false);
    expect(gates.isEnabled('canaryOn', { userId: 'user_1' })).toBe(true);
    expect(gates.isEnabled('canaryOff', { userId: 'user_1' })).toBe(false);
    expect(gates.isEnabled('denyUser', { userId: 'user_1' })).toBe(false);
    expect(gates.isEnabled('allowUser', { userId: 'user_2' })).toBe(true);
    expect(gates.isEnabled('missing')).toBe(false);
  });

  it('keeps percentage rollout decisions stable for the same subject', () => {
    const gates = new FeatureGateEvaluator({
      canary: { enabled: true, rolloutPercent: 25 },
    });

    const first = gates.isEnabled('canary', { sessionId: 'session_1' });
    const second = gates.isEnabled('canary', { sessionId: 'session_1' });

    expect(second).toBe(first);
  });
});

describe('production config', () => {
  it('loads defaults and selected HARNESS_* overrides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-production-config-'));
    const configPath = join(dir, 'harness.yaml');
    const previousEnvironment = process.env.HARNESS_ENVIRONMENT;
    const previousSchemaCache = process.env.HARNESS_FEATURE_SCHEMA_CACHE;
    const previousMetrics = process.env.HARNESS_METRICS_ENABLED;

    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
model:
  provider: mock
production:
  environment: staging
  featureGates:
    schemaCache: false
  metrics:
    enabled: true
`,
    );

    try {
      process.env.HARNESS_ENVIRONMENT = 'production';
      process.env.HARNESS_FEATURE_SCHEMA_CACHE = 'true';
      process.env.HARNESS_METRICS_ENABLED = 'false';

      const config = await loadHarnessConfig(configPath);

      expect(config.production).toMatchObject({
        environment: 'production',
        featureGates: {
          schemaCache: true,
        },
        metrics: {
          enabled: false,
        },
      });
    } finally {
      restoreEnv('HARNESS_ENVIRONMENT', previousEnvironment);
      restoreEnv('HARNESS_FEATURE_SCHEMA_CACHE', previousSchemaCache);
      restoreEnv('HARNESS_METRICS_ENABLED', previousMetrics);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
