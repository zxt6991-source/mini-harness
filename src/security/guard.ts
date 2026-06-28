// 该文件实现安全守卫，根据安全策略判断工具调用是否允许执行。
import type { SecurityPolicy } from './policy';

/** 安全守卫，根据当前策略阻止被拒绝或未授权的工具执行。 */
export class SecurityGuard {
  /** 保存安全策略，供每次工具调用前检查。 */
  constructor(private readonly policy: SecurityPolicy) {}

  /** 校验工具名是否符合 allowTools 和 denyTools 策略。 */
  async checkToolPermission(
    toolName: string,
    _input: Record<string, unknown>,
  ): Promise<void> {
    if (this.policy.denyTools.includes(toolName)) {
      throw new Error(`Tool denied by policy: ${toolName}`);
    }

    if (
      this.policy.allowTools.length > 0 &&
      !this.policy.allowTools.includes(toolName)
    ) {
      throw new Error(`Tool not allowed by policy: ${toolName}`);
    }
  }
}
