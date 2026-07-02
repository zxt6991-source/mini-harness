// 该脚本用 mock provider 验证生产装配入口，不访问真实模型服务。
import { createHarness, loadHarnessConfig } from '../src';

async function main() {
  const config = await loadHarnessConfig('configs/harness.yaml', {
    envPath: false,
  });
  const harness = createHarness({
    ...config,
    model: {
      ...config.model,
      provider: 'mock',
    },
    memory: {
      ...config.memory,
      type: 'in-memory',
    },
  });

  const response = await harness.engine.run('production smoke', 'smoke-session');

  if (response.content !== 'Mock response: production smoke') {
    throw new Error(`Unexpected smoke response: ${response.content}`);
  }

  const snapshot = harness.metrics?.snapshot();
  if (snapshot && snapshot.runtime.completedRuns !== 1) {
    throw new Error(
      `Unexpected completed run count: ${snapshot.runtime.completedRuns}`,
    );
  }

  console.log('MiniHarness mock smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
