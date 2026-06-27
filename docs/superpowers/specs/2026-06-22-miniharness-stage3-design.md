# MiniHarness 第三阶段设计

## 目标

按 `MiniHarness_TS_实现步骤文档.md` 的第三阶段实现真实模型接入和 Memory 增强。本阶段完成 `OpenAIProvider`、模型输出解析、质量门控、上下文组装和摘要记忆基础能力，并保持 `runtime/` 不依赖具体模型厂商。

## 范围

本轮实现：

- `src/models/openai-provider.ts`：基于 OpenAI Responses API 的 `ModelProvider` 实现。
- `src/models/parser.ts`：解析 Responses API 的 assistant 文本、`function_call` 和 token usage。
- `src/models/quality-gate.ts`：统一模型输出质量检查，避免空响应或非法响应静默进入 runtime。
- `src/memory/context-builder.ts`：按固定顺序组装上下文：System Prompt、摘要、相关历史、最近消息、当前输入。
- `src/memory/summarizer.ts`：提供简单可测试的摘要和字符裁剪能力。
- `src/memory/local-store.ts`：接入可选 `ContextBuilder`，保留原有默认行为。
- 测试覆盖：真实模型普通文本、tool_call 解析、工具调用与 Engine 集成、错误归一化、最近 N 轮上下文、摘要和裁剪。
- 步骤文档标注：第三阶段已完成项逐项更新，SQLite 标为后续增强。

本轮不实现：

- SQLite 持久化。原因：当前第三阶段验收重点是模型协议适配和上下文管理；SQLite 会引入数据库依赖和迁移复杂度，适合独立后续阶段。
- 真实网络集成测试。单元测试用 mock fetch；生产代码支持 `OPENAI_API_KEY` 和真实 API。

## OpenAI Provider 设计

`OpenAIProvider` 通过构造函数接收 `apiKey`、`model`、`baseUrl`、`fetchFn` 和默认超时。`apiKey` 可显式传入，也可从 `OPENAI_API_KEY` 读取；缺失时抛出清晰错误，不把密钥写入代码。

请求使用 Responses API：

- 内部 `Message[]` 转成 Responses `input`。
- `Tool[]` 转成 `type: "function"` 的 tools，保留 `name`、`description` 和 `schema`。
- `ModelOptions.maxTokens` 映射到 `max_output_tokens`。
- `ModelOptions.temperature` 直接透传。
- 请求超时使用 `AbortController`。

解析规则：

- `response.output` 中 `type: "message"` 且 `role: "assistant"` 的文本内容合并为 `Message.content`。
- `response.output` 中 `type: "function_call"` 转成内部 `ToolCall`，`call_id` 优先作为 `ToolCall.id`，否则使用该项 `id`。
- `arguments` 必须 `JSON.parse`，解析失败抛出模型解析错误。
- usage 兼容读取 `input_tokens`、`output_tokens`、`total_tokens`。

参考官方文档：Responses create API 和 Function calling 文档说明 `function_call` 会出现在 response `output` 数组中，并携带 `call_id`、`name` 和 JSON 字符串 `arguments`。

## Memory 增强设计

新增 `ContextBuilder`，负责从 Memory 的基础能力中组装上下文。顺序固定为：

```text
System Prompt
-> 摘要记忆
-> 相关历史记忆
-> 最近 N 轮消息
-> 当前用户输入
```

`SimpleSummarizer` 只做确定性摘要和字符裁剪，不调用模型，便于测试。`InMemoryStore` 增加可选构造参数；没有传入 builder 时保持现有默认行为。

## 错误与日志

新增模型错误类型，归一化缺 API key、HTTP 401/429/5xx、超时、网络错误、空响应、JSON 参数解析失败。`OpenAIProvider` 在失败时记录 `traceId`、`sessionId`、`modelName` 能力需要通过 `ModelChatInput.metadata` 支持，因此本阶段会给 `ModelChatInput` 增加可选 `metadata` 字段，`Engine` 调用模型时传入 `sessionId` 和 `traceId`。

## 验收标准

- `OpenAIProvider` 可以解析普通文本响应。
- `OpenAIProvider` 可以解析 `function_call` 并返回内部 `toolCalls`。
- `Engine` 可以用 OpenAIProvider 风格输出执行工具并得到最终消息。
- 模型请求失败不会无提示崩溃，并返回可识别错误。
- 上下文可以按最近 N 轮、关键词搜索、摘要、裁剪规则组装。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过。

## 约束

当前目录不是 git 仓库，因此不执行 git commit。若后续需要提交历史，应先由用户确认是否初始化 git。
