import { describe, expect, it } from 'vitest';
import {
  createHarness,
  createMiniHarnessFetchHandler,
  loadHarnessConfig,
} from '../src';
import type { HarnessConfig } from '../src';

async function createMockHarnessConfig(): Promise<HarnessConfig> {
  const config = await loadHarnessConfig('configs/harness.yaml', {
    envPath: false,
  });

  return {
    ...config,
    model: { ...config.model, provider: 'mock' },
    memory: { ...config.memory, type: 'in-memory' },
  };
}

describe('MiniHarness HTTP service handler', () => {
  it('runs a request through POST /v1/runs', async () => {
    const harness = createHarness(await createMockHarnessConfig());
    const handle = createMiniHarnessFetchHandler(harness);

    const response = await handle(
      new Request('http://localhost/v1/runs', {
        method: 'POST',
        body: JSON.stringify({
          input: 'hello service',
          sessionId: 'service-session',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      message: {
        role: 'assistant',
        content: 'Mock response: hello service',
      },
    });
  });

  it('streams EngineEvent payloads through POST /v1/runs/stream', async () => {
    const harness = createHarness(await createMockHarnessConfig());
    const handle = createMiniHarnessFetchHandler(harness);

    const response = await handle(
      new Request('http://localhost/v1/runs/stream', {
        method: 'POST',
        body: JSON.stringify({
          input: 'hello stream',
          sessionId: 'stream-session',
        }),
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const text = await response.text();
    expect(text).toContain('event: agent_start');
    expect(text).toContain('event: agent_end');
    expect(text).toContain('Mock response: hello stream');
  });

  it('reports health, readiness and metrics snapshots', async () => {
    const harness = createHarness(await createMockHarnessConfig());
    const handle = createMiniHarnessFetchHandler(harness);

    const health = await handle(new Request('http://localhost/healthz'));
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: 'ok',
      environment: 'development',
    });

    const ready = await handle(new Request('http://localhost/readyz'));
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({
      status: 'ready',
      provider: 'mock',
      tools: {
        registered: 0,
      },
    });

    const metrics = await handle(new Request('http://localhost/metrics'));
    expect(metrics.status).toBe(200);
    await expect(metrics.json()).resolves.toMatchObject({
      runtime: {
        startedRuns: 0,
      },
      health: {
        status: 'healthy',
      },
    });
  });

  it('returns stable errors for invalid input and unknown routes', async () => {
    const harness = createHarness(await createMockHarnessConfig());
    const handle = createMiniHarnessFetchHandler(harness);

    const invalid = await handle(
      new Request('http://localhost/v1/runs', {
        method: 'POST',
        body: JSON.stringify({ input: '' }),
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
      },
    });

    const missing = await handle(new Request('http://localhost/missing'));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: {
        code: 'NOT_FOUND',
      },
    });
  });
});
