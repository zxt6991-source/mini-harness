// 该文件封装工具执行流程，在调用前做安全校验，并记录执行成功或失败日志。
import type { Tool, ToolContext, ToolResult } from '../core';
import { logger } from '../reliability/logger';
import type { SecurityGuard } from '../security/guard';

/** 工具执行器，在真正调用工具前做权限检查，并统一记录执行日志。 */
export class ToolExecutor {
  /** 注入安全守卫，用于检查工具调用是否符合当前安全策略。 */
  constructor(private readonly securityGuard: SecurityGuard) {}

  /** 校验并执行工具调用，返回工具结果或透传工具抛出的错误。 */
  async execute(
    tool: Tool,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    await this.securityGuard.checkToolPermission(tool.name, input);

    const startedAt = Date.now();

    try {
      const result = await tool.call(input, ctx);

      logger.info({
        traceId: ctx.traceId,
        sessionId: ctx.sessionId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error({
        traceId: ctx.traceId,
        sessionId: ctx.sessionId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        error,
      });

      throw error;
    }
  }
}
