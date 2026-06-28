// 该文件负责调度一组工具调用，支持受限并发、顺序归并和错误观察模式。
import type { Message, ToolCall, ToolContext, ToolRegistry } from '../core';

export type ToolErrorMode = 'throw' | 'observe';

export interface ToolSchedulerOptions {
  maxConcurrentTools?: number;
  toolErrorMode?: ToolErrorMode;
}

export interface ToolExecutionRecord {
  toolCall: ToolCall;
  message: Message;
  latencyMs: number;
}

/** 从未知错误中提取可读错误消息。 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 从未知错误中提取框架错误码。 */
function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

/** 把工具执行错误转换成可反馈给模型的 tool 消息。 */
function createErrorObservation(toolCall: ToolCall, error: unknown): Message {
  const errorName = error instanceof Error ? error.name : 'Error';

  return {
    id: toolCall.id,
    role: 'tool',
    content: `${errorName}: ${getErrorMessage(error)}`,
    createdAt: Date.now(),
    metadata: {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      success: false,
      errorCode: getErrorCode(error),
      errorName,
    },
  };
}

/** 工具调度器，控制并发数并把执行结果按原始工具调用顺序归并。 */
export class ToolScheduler {
  private readonly maxConcurrentTools: number;
  private readonly toolErrorMode: ToolErrorMode;

  /** 注入工具注册表和调度选项。 */
  constructor(
    private readonly registry: ToolRegistry,
    options: ToolSchedulerOptions = {},
  ) {
    this.maxConcurrentTools = Math.max(1, options.maxConcurrentTools ?? 1);
    this.toolErrorMode = options.toolErrorMode ?? 'throw';
  }

  /** 并发执行全部工具调用，并返回按 toolCalls 原顺序排列的执行记录。 */
  async executeAll(
    toolCalls: ToolCall[],
    ctx: ToolContext,
  ): Promise<ToolExecutionRecord[]> {
    const results = new Array<ToolExecutionRecord>(toolCalls.length);
    let nextIndex = 0;
    const workerCount = Math.min(this.maxConcurrentTools, toolCalls.length);

    const runWorker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex++;

        if (index >= toolCalls.length) {
          return;
        }

        results[index] = await this.executeOne(toolCalls[index], ctx);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));
    return results;
  }

  /** 执行单个工具调用，并按错误模式决定抛出还是转换为观察消息。 */
  private async executeOne(
    toolCall: ToolCall,
    ctx: ToolContext,
  ): Promise<ToolExecutionRecord> {
    const startedAt = Date.now();

    try {
      const message = await this.registry.execute(toolCall, ctx);
      return {
        toolCall,
        message,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (this.toolErrorMode === 'throw') {
        throw error;
      }

      return {
        toolCall,
        message: createErrorObservation(toolCall, error),
        latencyMs: Date.now() - startedAt,
      };
    }
  }
}
