import type { SecurityPolicy } from './policy';

export class SecurityGuard {
  constructor(private readonly policy: SecurityPolicy) {}

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
