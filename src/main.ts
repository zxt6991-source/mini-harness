// 该文件是本地运行 MiniHarness 的示例入口，负责加载配置并启动一次引擎调用。
import { createHarness } from './app/create-harness';
import { loadHarnessConfig } from './utils/config';

/** 加载本地配置并启动一次默认会话，用于演示 MiniHarness 的基本运行流程。 */
async function main() {
  const config = await loadHarnessConfig();
  const harness = createHarness(config);
  const response = await harness.engine.run('帮我分析一下当前项目结构', 'default-session');

  console.log(response.content);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
