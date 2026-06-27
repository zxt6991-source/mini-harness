# MiniHarness 第五阶段编排引擎设计

## 目标

按 `MiniHarness_TS_实现步骤文档.md` 的第五阶段实现本地可测试的任务编排引擎。编排层用于复杂任务拆解、依赖执行、失败重试/降级，以及多 Agent 角色协作。

## 范围

本轮实现：

- `src/orchestration/task.ts`：Task、TaskStatus、执行上下文、执行结果类型。
- `src/orchestration/graph.ts`：任务依赖图、拓扑排序、可运行任务判断、循环依赖检测。
- `src/orchestration/state-machine.ts`：任务状态流转约束。
- `src/orchestration/planner.ts`：将复杂目标拆成可执行 Task。
- `src/orchestration/coordinator.ts`：按依赖顺序执行任务，支持重试、失败降级和角色 handler。
- 配置、README、步骤文档更新。
- 测试覆盖：任务拆解、状态流转、依赖关系、失败重试/降级、多 Agent 角色分工。

本轮不实现：

- 真实多 Agent 进程或网络协作。原因：当前框架还没有 Agent 运行池，本阶段先以 `role -> handler` 抽象验证编排契约。
- 持久化执行状态。原因：需要配合后续数据库/存储层，本轮先保证内存编排语义正确。

## 模块设计

`Task` 是编排层的最小执行单元：

```text
pending -> running -> done
pending -> running -> failed
failed  -> running -> done
pending -> skipped
```

`TaskGraph` 负责：

- 按 `dependsOn` 建图。
- 检测缺失依赖。
- 检测循环依赖。
- 返回拓扑顺序。
- 根据已完成任务返回当前可运行任务。

`Planner` 负责：

- 从简单目标生成单个 Task。
- 从 steps 或字符串列表生成多 Task。
- 为没有 id 的步骤生成稳定 id。
- 支持任务 role，便于多 Agent 协作。

`Coordinator` 负责：

- 构造任务图。
- 查找可运行任务。
- 按任务 role 选择 handler。
- 任务失败时按 `maxRetries` 重试。
- 重试后仍失败时，如果配置 `continueOnFailure`，将依赖该任务的 pending 任务标记为 skipped；否则抛错。

## 验收标准

- 可以把复杂目标拆成多个 Task。
- Task 支持 `pending`、`running`、`done`、`failed`、`skipped` 状态。
- Task 之间支持 `dependsOn`。
- 某个 Task 失败后可以重试或降级。
- 多个 Agent 可以按 role 分工协作。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过。

## 约束

当前目录不是 git 仓库，因此不执行 git commit。若后续需要提交历史，应先由用户确认是否初始化 git。
