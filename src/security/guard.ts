// 该文件实现安全守卫，根据安全策略判断工具调用是否允许执行。
import { ToolPermissionError, type ToolCapability } from '../core';
import { detectDangerousCommand, extractShellCommands } from './command';
import type { SecurityPolicy } from './policy';
import { validateSandboxPath } from './path';

const DEFAULT_PATH_PARAMETER_NAMES = [
  'path',
  'filePath',
  'dirPath',
  'cwd',
  'workspaceDir',
  'baseDir',
  'targetPath',
];

const DEFAULT_PARAMETER_CONSTRAINTS = {
  timeoutMs: { min: 1, max: 300_000 },
  timeout_seconds: { min: 1, max: 300 },
  memoryMb: { min: 1, max: 2048 },
  memory_mb: { min: 1, max: 2048 },
  fileSizeMb: { min: 1, max: 1024 },
  file_size_mb: { min: 1, max: 1024 },
};

/** 安全守卫，根据当前策略阻止被拒绝或未授权的工具执行。 */
export class SecurityGuard {
  /** 保存安全策略，供每次工具调用前检查。 */
  constructor(private readonly policy: SecurityPolicy) {}

  /** 校验工具名是否符合 allowTools 和 denyTools 策略。 */
  async checkToolPermission(
    toolName: string,
    input: Record<string, unknown>,
    capability?: Partial<Pick<ToolCapability, 'category' | 'requiredPermissions'>>,
  ): Promise<void> {
    if (this.policy.denyTools.includes(toolName)) {
      throw new ToolPermissionError(`Tool denied by policy: ${toolName}`);
    }

    if (
      this.policy.allowTools.length > 0 &&
      !this.policy.allowTools.includes(toolName)
    ) {
      throw new ToolPermissionError(`Tool not allowed by policy: ${toolName}`);
    }

    const requiredPermissions = capability?.requiredPermissions ?? [];
    const requiresShell =
      capability?.category === 'execution' || requiredPermissions.includes('shell');
    const requiresNetwork =
      capability?.category === 'network' || requiredPermissions.includes('network');
    const requiresFile =
      capability?.category === 'file' ||
      requiredPermissions.includes('file') ||
      requiredPermissions.includes('filesystem');

    if (!this.policy.allowNetwork && requiresNetwork) {
      throw new ToolPermissionError(
        `Network tools are disabled by policy: ${toolName}`,
      );
    }

    if (!this.policy.allowShell && requiresShell) {
      throw new ToolPermissionError(
        `Shell tools are disabled by policy: ${toolName}`,
      );
    }

    this.checkParameterConstraints(input);

    if (requiresFile) {
      this.checkPathParameters(input);
    }

    if (requiresShell) {
      this.checkShellCommand(input);
    }
  }

  private checkShellCommand(input: Record<string, unknown>): void {
    const command = input.command;

    if (typeof command !== 'string') {
      return;
    }

    if (this.policy.commandGuardrails?.enabled !== false) {
      const detection = detectDangerousCommand(command, this.policy.commandGuardrails);
      if (detection.dangerous) {
        throw new ToolPermissionError(
          `Dangerous shell command blocked: ${detection.reason ?? command}`,
        );
      }
    }

    if (this.policy.allowedShellCommands.length > 0) {
      const allowedCommands = new Set(this.policy.allowedShellCommands);
      for (const shellCommand of extractShellCommands(command)) {
        if (!allowedCommands.has(shellCommand)) {
          throw new ToolPermissionError(
            `Shell command not allowed by policy: ${shellCommand}`,
          );
        }
      }
    }
  }

  private checkPathParameters(input: Record<string, unknown>): void {
    if (this.policy.pathValidation?.enabled === false) {
      return;
    }

    const parameterNames =
      this.policy.pathValidation?.pathParameterNames ?? DEFAULT_PATH_PARAMETER_NAMES;

    for (const parameterName of parameterNames) {
      const value = input[parameterName];

      if (typeof value !== 'string') {
        continue;
      }

      try {
        validateSandboxPath(this.policy.sandboxDir, value, {
          maxPathLength: this.policy.pathValidation?.maxPathLength,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ToolPermissionError(message, error);
      }
    }
  }

  private checkParameterConstraints(input: Record<string, unknown>): void {
    const constraints = {
      ...DEFAULT_PARAMETER_CONSTRAINTS,
      ...this.policy.parameterConstraints,
    };

    for (const [parameterName, range] of Object.entries(constraints)) {
      const value = input[parameterName];

      if (value === undefined) {
        continue;
      }

      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < range.min ||
        value > range.max
      ) {
        throw new ToolPermissionError(
          `Parameter ${parameterName} out of allowed range: ${range.min}-${range.max}`,
        );
      }
    }
  }
}
