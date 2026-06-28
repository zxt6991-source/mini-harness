// 该文件封装工具执行流程，在调用前做安全校验，并记录执行成功或失败日志。
import {
  MiniHarnessError,
  ToolExecutionError,
  ToolTimeoutError,
  ToolValidationError,
  type Tool,
  type ToolCapability,
  type ToolContext,
  type ToolResult,
} from '../core';
import { logger } from '../reliability/logger';
import type { SecurityGuard } from '../security/guard';
import { normalizeToolResult } from './result';
import { formatValidationIssues, validateToolInput } from './validation';

/** 工具执行器，在真正调用工具前做权限检查，并统一记录执行日志。 */
export class ToolExecutor {
  /** 注入安全守卫，用于检查工具调用是否符合当前安全策略。 */
  constructor(private readonly securityGuard: SecurityGuard) {}

  /** 校验并执行工具调用，返回工具结果或透传工具抛出的错误。 */
  async execute(
    tool: Tool,
    input: Record<string, unknown>,
    ctx: ToolContext,
    capability?: ToolCapability,
  ): Promise<ToolResult> {
    const startedAt = Date.now();

    try {
      await this.securityGuard.checkToolPermission(
        tool.name,
        input,
        capability ?? tool.capability,
      );

      const validation = validateToolInput(tool, input);
      if (!validation.ok) {
        throw new ToolValidationError(
          `Invalid input for tool '${tool.name}': ${formatValidationIssues(
            validation.issues ?? [],
          )}`,
        );
      }

      const effectiveTimeoutMs = ctx.timeoutMs ?? tool.capability?.timeoutMs;
      const toolContext =
        effectiveTimeoutMs && effectiveTimeoutMs > 0
          ? { ...ctx, timeoutMs: effectiveTimeoutMs }
          : ctx;
      const rawResult = await this.callWithTimeout(
        () => tool.call(input, toolContext),
        effectiveTimeoutMs,
      );
      const result = normalizeToolResult(
        tool,
        rawResult,
        toolContext,
        Date.now() - startedAt,
      );

      logger.info({
        traceId: ctx.traceId,
        sessionId: ctx.sessionId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        success: result.success,
      });

      return result;
    } catch (error) {
      const normalizedError =
        error instanceof MiniHarnessError
          ? error
          : new ToolExecutionError(`Tool execution error: ${getErrorMessage(error)}`, error);

      logger.error({
        traceId: ctx.traceId,
        sessionId: ctx.sessionId,
        toolName: tool.name,
        latencyMs: Date.now() - startedAt,
        errorCode: normalizedError.code,
        error: normalizedError,
      });

      throw normalizedError;
    }
  }

  /** 用 Promise 级超时保护工具调用，即使工具未监听 AbortSignal 也能结束等待。 */
  private async callWithTimeout(
    call: () => Promise<ToolResult>,
    timeoutMs: number | undefined,
  ): Promise<ToolResult> {
    if (!timeoutMs || timeoutMs <= 0) {
      return call();
    }

    return new Promise<ToolResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ToolTimeoutError(timeoutMs));
      }, timeoutMs);

      call()
        .then(resolve, reject)
        .finally(() => clearTimeout(timeout));
    });
  }
}

/** 从未知错误中提取可读错误消息。 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
