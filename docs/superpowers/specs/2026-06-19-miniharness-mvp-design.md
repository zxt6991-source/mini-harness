# MiniHarness MVP 设计

## 目标

按 `MiniHarness_TS_技术方案.md` 和 `MiniHarness_TS_实现步骤文档.md` 实现 MiniHarness TypeScript MVP。范围覆盖步骤文档推荐开发顺序的 1-19：工程初始化、最小 Agent Harness 主链路、EchoTool、安全守卫、日志、ToolExecutor 和基础测试。

## 范围

本轮实现：

- TypeScript 工程配置：`package.json`、`tsconfig.json`、`tsup.config.ts`。
- 核心接口：`Message`、`Tool`、`ModelProvider`、`Memory`、错误类型。
- 最小运行链路：`Engine -> Memory -> MockProvider -> Assistant Message -> Memory`。
- 工具基础能力：工具注册中心、EchoTool、SecurityGuard、ToolExecutor。
- 基础可靠性：`pino` 结构化 logger。
- 基础交付物：`README.md`、`configs/harness.yaml`、示例目录、Vitest 测试。
- 步骤文档标注：每完成一个开发内容，在 `MiniHarness_TS_实现步骤文档.md` 对应小节下标记状态。

本轮不实现：

- 真实模型 Provider。
- MCP 客户端和协议适配。
- 编排引擎。
- 文件、HTTP、Shell 等高风险内置工具。

## 架构

`core/` 只放类型和接口，不依赖实现。`runtime/engine.ts` 只依赖 `core` 抽象，通过构造函数注入 `ModelProvider`、`Memory`、`ToolRegistry`。工具执行通过 `ToolExecutor` 统一接入 `SecurityGuard` 和 logger，后续可以替换或扩展执行流水线。

## 验收

- `pnpm dev` 输出 `Mock response: 帮我分析一下当前项目结构`。
- `pnpm test` 覆盖 Memory、Engine、Registry、SecurityGuard、ToolExecutor、路径校验。
- `pnpm build` 可以生成 ESM/CJS 和类型声明。
- `MiniHarness_TS_实现步骤文档.md` 已标注 MVP 已完成小节。

## 约束

当前目录不是 git 仓库，因此不执行 git commit。若后续需要提交历史，应先由用户确认是否初始化 git。
