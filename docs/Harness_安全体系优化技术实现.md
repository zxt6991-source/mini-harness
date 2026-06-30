# MiniHarness Harness 安全体系优化技术实现

## 1. 背景

本方案基于 `/Users/jojo/Desktop/all-agent/harness_engineering_guide/12_security` 中的 Harness 安全体系指南，并结合当前 MiniHarness TypeScript 项目的已有实现制定。

第 12 章强调的核心防线包括：

- 威胁模型：恶意工具调用、路径穿越、权限提升、沙箱逃逸、凭据外泄、资源耗尽、间接提示注入、记忆投毒等。
- 权限与沙箱：权限决定“是否允许执行”，沙箱限制“执行后的破坏范围”。
- 工具调用护栏：危险命令检测、只读/参数约束、超时强制和审计日志。
- 路径校验：长度检查、迭代 URL 解码、Unicode 规范化、平台路径规范化、`realpath` 边界检查。
- MiniHarness 集成：权限决策 -> 路径校验 -> 命令护栏 -> 安全执行。

当前项目已经具备基础安全模块：

| 能力 | 当前落点 | 状态 |
|---|---|---|
| 工具 allow/deny | `src/security/guard.ts` | 已实现基础策略 |
| 网络与 Shell 开关 | `SecurityGuard.checkToolPermission()` | 已实现基础拦截 |
| 路径边界检查 | `src/security/path.ts` | 仅 `path.resolve()` + 前缀判断 |
| 工具超时 | `src/tools/executor.ts` | 已实现 Promise 级 timeout |
| 工具输入 Schema 校验 | `src/tools/validation.ts` | 已实现 JSON schema 子集校验 |
| 输出治理 | `src/models/output-governance.ts` | 已实现模型输出层注入模式检查 |

主要缺口：

- 路径校验尚未覆盖多重 URL 编码、Unicode 规范化、反斜杠注入、符号链接逃逸和 `/tmp/workspace-evil` 前缀误判。
- `allowedShellCommands` 尚未真正约束 Shell 命令，缺少危险命令、管道和内联解释器入口检测。
- 缺少对工具参数中路径字段和资源字段的统一安全检查。
- 安全拒绝没有结构化审计元数据，不利于后续指标、告警和红队回放。
- 技术方案文档仍停留在 MVP 安全层描述，未反映第 12 章要求的纵深防护。

## 2. 本次优化目标

1. 增强 `validateSandboxPath()` 为五层路径校验，默认失败安全。
2. 增加危险命令检测器，覆盖黑名单命令、Shell 控制符、管道命令、`bash -c`、`python -c`、`node -e` 等内联执行入口。
3. 扩展 `SecurityPolicy`，增加路径参数名、数值参数范围、路径校验开关、危险命令护栏开关和审计开关。
4. 扩展 `SecurityGuard.checkToolPermission()`，在工具执行前完成 allow/deny、网络/Shell 权限、命令护栏、路径参数校验和资源参数约束。
5. 保持 `ToolExecutor`、`ToolRegistry` 和现有工具 API 兼容，不引入外部沙箱依赖。
6. 更新 `MiniHarness_TS_技术方案.md` 的安全章节、配置示例和验收标准。

## 3. 非目标

- 本轮不实现交互式用户审批 UI；当前项目没有审批通道和持久审批状态。
- 本轮不引入 Docker、Firecracker、gVisor 等运行时沙箱；沙箱执行作为后续独立任务。
- 本轮不新增真实 Shell 内置工具；只为 execution 类工具调用建立前置安全护栏。
- 本轮不做模型推理链审计或 LlamaFirewall 类能力；仍由输出治理和工具层护栏分层承担。
- 本轮不修改长期记忆写入策略；记忆投毒防护后续应在 `memory/` 与 `context-builder` 层单独设计。

## 4. 设计方案

### 4.1 安全策略模型

扩展后的 `SecurityPolicy` 保持旧字段兼容，并新增可选字段：

```ts
export interface SecurityPolicy {
  allowTools: string[];
  denyTools: string[];
  sandboxDir: string;
  allowNetwork: boolean;
  allowShell: boolean;
  allowedShellCommands: string[];
  pathValidation?: {
    enabled?: boolean;
    maxPathLength?: number;
    pathParameterNames?: string[];
  };
  commandGuardrails?: {
    enabled?: boolean;
    dangerousCommands?: string[];
    safeSubcommands?: Record<string, string[]>;
    blockShellControlOperators?: boolean;
    blockInlineExecution?: boolean;
  };
  parameterConstraints?: {
    timeoutMs?: { min: number; max: number };
    timeout_seconds?: { min: number; max: number };
    memoryMb?: { min: number; max: number };
    memory_mb?: { min: number; max: number };
    fileSizeMb?: { min: number; max: number };
    file_size_mb?: { min: number; max: number };
  };
  audit?: {
    enabled?: boolean;
  };
}
```

旧调用方只传基础字段时，默认行为保持兼容：

- path validation 默认启用，路径参数名默认为 `path`、`filePath`、`dirPath`、`cwd`、`workspaceDir`。
- command guardrails 默认启用。
- 参数范围默认采用保守上限：timeout 最大 300000ms 或 300s，memory 最大 2048MB，file size 最大 1024MB。

### 4.2 五层路径校验

`validateSandboxPath(baseDir, targetPath, options?)` 的校验顺序：

1. 长度检查：超过 `maxPathLength` 直接拒绝。
2. 迭代 URL 解码：最多 20 次，防止 `..%252f` 多重编码绕过。
3. Unicode NFC 规范化。
4. 平台规范化：统一 `\` 为 `/`，使用 `posixpath.normalize()` 消除冗余片段。
5. `realpathSync.native()` 解析 base 和 candidate，并用 `path.relative()` 判断 candidate 是否仍在 base 内。

对于不存在的目标路径，仍解析已存在的最近父目录，避免新文件写入场景被误拒，同时保证父目录不能逃逸沙箱。

### 4.3 命令护栏

新增 `src/security/command.ts`：

- `detectDangerousCommand(command, options?)` 返回 `{ dangerous, reason, command? }`。
- 默认禁止：`rm`、`dd`、`mkfs`、`shred`、`sysctl`、`iptables`、`insmod`、`rmmod`、`reboot`、`shutdown`、`chown`、`chmod`、`sudo`、`passwd`、`useradd`、`userdel`、`groupadd`、`crontab`、`visudo`、`mount`、`umount`、`apt`、`yum` 等。
- `apt` / `yum` 仅允许查询类子命令，例如 `list`、`search`、`show`、`info`。
- 默认阻止 Shell 控制符：`;`、`&&`、`||`、`$(`、反引号、换行、后台执行等。
- 默认阻止内联解释器入口：`bash -c`、`sh -c`、`python -c`、`python3 -c`、`node -e`、`node --eval`。
- 管道 `|` 允许解析，但管道两侧命令都会检查。

`allowedShellCommands` 用于进一步收窄 Shell 可执行命令：当列表非空时，命令链中的每个实际命令都必须出现在 allowlist 中。

### 4.4 参数约束与路径参数识别

`SecurityGuard` 在权限通过后继续检查：

- 对 `category: 'file'` 或 `requiredPermissions` 包含 `file` / `filesystem` 的工具，校验输入对象中所有路径参数。
- 对 `category: 'execution'` 或 `requiredPermissions` 包含 `shell` 的工具，提取 `command` 字段做命令护栏。
- 对 `timeoutMs`、`timeout_seconds`、`memoryMb`、`memory_mb`、`fileSizeMb`、`file_size_mb` 做范围校验。

校验失败统一抛出 `ToolPermissionError`，保持工具调用前失败，不进入实际工具逻辑。

### 4.5 审计元数据

本轮不新增持久审计存储。`SecurityGuard` 会在拒绝前生成稳定错误消息，`ToolExecutor` 已有结构化日志，能够记录：

- `traceId`
- `sessionId`
- `toolName`
- `errorCode: TOOL_PERMISSION_DENIED`
- 拒绝原因

后续可把 `SecurityGuard` 的审计事件接入 `ProductionMetricsCollector` 或外部 sink。

## 5. 文件变更

- 新增：`src/security/command.ts`
- 修改：`src/security/policy.ts`
- 修改：`src/security/path.ts`
- 修改：`src/security/guard.ts`
- 修改：`src/index.ts`
- 修改：`configs/harness.yaml`
- 修改：`tests/security.test.ts`
- 新增：`docs/Harness_安全体系优化技术实现.md`
- 更新：`MiniHarness_TS_技术方案.md`

## 6. 测试策略

采用现有 Vitest 风格，先写失败测试再实现：

- 路径校验：
  - 合法相对路径和沙箱根路径通过。
  - `../secret.txt`、`..%2fsecret.txt`、`..%252fsecret.txt` 被拒绝。
  - `subdir\\..\\..\\secret.txt` 被拒绝。
  - 指向沙箱外文件的符号链接被拒绝。
  - `/tmp/workspace-evil` 不会因前缀相同而通过。
- 命令护栏：
  - `rm -rf /`、`ls | rm -rf /`、`bash -c "rm -rf /"` 被拒绝。
  - `apt list` 允许，`apt install curl` 被拒绝。
  - `allowedShellCommands: ['ls']` 下 `cat file.txt` 被拒绝。
- 参数约束：
  - `timeoutMs` 超出范围被拒绝。
  - file 类工具的 `path` 参数会被沙箱路径校验。
- 回归：
  - 旧的 allow/deny、network、shell 开关测试继续通过。

最终验收命令：

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 7. 后续路线

1. 接入用户审批：把 `ASK` / `AUTO` / `DENY` 权限等级和参数指纹审批缓存落地。
2. 接入执行沙箱：为 execution 工具提供容器级或进程级隔离，并限制网络、文件系统、能力集和 PID 数。
3. 接入安全指标：把拒绝原因聚合到 `ProductionMetricsCollector`，输出安全拒绝率和高风险调用榜。
4. 接入记忆防护：给长期记忆加入来源追踪、可信度、定期审计和可回滚清理。
5. 接入间接提示注入防护：为工具返回内容加信任标签，并在进入上下文前做清洗和边界标注。

## 8. 验收标准

- 所有工具调用仍先经过 `SecurityGuard`。
- 文件路径参数默认经过五层路径校验。
- Shell execution 工具默认经过危险命令、管道、内联执行和 allowlist 检查。
- 资源参数超出安全范围时在执行前拒绝。
- 安全拒绝以 `TOOL_PERMISSION_DENIED` 进入现有结构化日志。
- 技术方案文档反映新的安全体系和仍未实现的沙箱/审批边界。
