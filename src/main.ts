import { InMemoryStore } from './memory/local-store';
import { MockProvider } from './models/mock-provider';
import { Engine } from './runtime/engine';
import { DefaultToolRegistry } from './tools/registry';

async function main() {
  const model = new MockProvider();
  const memory = new InMemoryStore();
  const tools = new DefaultToolRegistry();

  const engine = new Engine(model, memory, tools, {
    maxSteps: 8,
    requestTimeoutMs: 60_000,
    enableStream: false,
  });

  const response = await engine.run('帮我分析一下当前项目结构', 'default-session');

  console.log(response.content);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
