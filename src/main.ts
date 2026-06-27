import { InMemoryStore } from './memory/local-store';
import { createModelProvider } from './models/provider-factory';
import { Engine } from './runtime/engine';
import { DefaultToolRegistry } from './tools/registry';
import { loadHarnessConfig } from './utils/config';

async function main() {
  const config = await loadHarnessConfig();
  const model = createModelProvider(config);
  const memory = new InMemoryStore();
  const tools = new DefaultToolRegistry();

  const engine = new Engine(model, memory, tools, {
    maxSteps: config.runtime.maxSteps,
    requestTimeoutMs: config.runtime.requestTimeoutMs,
    enableStream: config.runtime.enableStream,
  });

  const response = await engine.run('帮我分析一下当前项目结构', 'default-session');

  console.log(response.content);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
