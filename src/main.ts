// 该文件是本地运行 MiniHarness 的示例入口，负责加载配置并启动一次引擎调用。
import { createMemory } from './memory/factory';
import { ModelOutputGovernance } from './models/output-governance';
import { createModelProvider } from './models/provider-factory';
import { Engine } from './runtime/engine';
import { DefaultToolRegistry } from './tools/registry';
import { loadHarnessConfig } from './utils/config';

/** 加载本地配置并启动一次默认会话，用于演示 MiniHarness 的基本运行流程。 */
async function main() {
  const config = await loadHarnessConfig();
  const model = createModelProvider(config);
  const memory = createMemory(config.memory);
  const tools = new DefaultToolRegistry();

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
  });

  const response = await engine.run('帮我分析一下当前项目结构', 'default-session');

  console.log(response.content);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
