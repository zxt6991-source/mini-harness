import type { Tool, ToolContext, ToolResult } from '../core';
import { logger } from '../reliability/logger';
import type { SecurityGuard } from '../security/guard';

export class ToolExecutor {
  constructor(private readonly securityGuard: SecurityGuard) {}

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
