// 该文件实现安全守卫，根据安全策略判断工具调用是否允许执行。
import { ToolPermissionError, type ToolCapability } from '../core';
import type { SecurityPolicy } from './policy';

/** 安全守卫，根据当前策略阻止被拒绝或未授权的工具执行。 */
export class SecurityGuard {
  /** 保存安全策略，供每次工具调用前检查。 */
  constructor(private readonly policy: SecurityPolicy) {}

  /** 校验工具名是否符合 allowTools 和 denyTools 策略。 */
  async checkToolPermission(
    toolName: string,
    _input: Record<string, unknown>,
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

    if (
      !this.policy.allowNetwork &&
      (capability?.category === 'network' || requiredPermissions.includes('network'))
    ) {
      throw new ToolPermissionError(
        `Network tools are disabled by policy: ${toolName}`,
      );
    }

    if (
      !this.policy.allowShell &&
      (capability?.category === 'execution' || requiredPermissions.includes('shell'))
    ) {
      throw new ToolPermissionError(
        `Shell tools are disabled by policy: ${toolName}`,
      );
    }
  }
}
