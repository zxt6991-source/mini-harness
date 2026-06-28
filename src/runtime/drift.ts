// 该文件提供运行时漂移保护，先以重复工具调用和工具调用上限做轻量检测。
import type { ToolCall } from '../core';
import { MiniHarnessError } from '../core';

export interface DriftGuardOptions {
  maxToolCalls?: number;
  repeatedToolWindow?: number;
  repeatedToolThreshold?: number;
  reflectionInterval?: number;
}

export const defaultDriftGuardOptions: Required<DriftGuardOptions> = {
  maxToolCalls: Number.POSITIVE_INFINITY,
  repeatedToolWindow: 6,
  repeatedToolThreshold: Number.POSITIVE_INFINITY,
  reflectionInterval: 0,
};

/** 表示运行时检测到重复行动或工具调用越界等漂移风险。 */
export class RuntimeDriftError extends MiniHarnessError {
  /** 创建漂移检测错误。 */
  constructor(reason: string) {
    super(`Runtime drift detected: ${reason}`, 'RUNTIME_DRIFT_DETECTED');
  }
}

/** 稳定序列化未知值，确保对象键顺序不同不会影响工具调用签名。 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

/** 根据工具名和参数生成稳定签名，用于重复行动检测。 */
export function createToolSignature(toolCall: ToolCall): string {
  return `${toolCall.name}:${stableStringify(toolCall.arguments)}`;
}

/** 漂移保护器，记录工具行动并在触发阈值时抛出运行时漂移错误。 */
export class DriftGuard {
  private readonly options: Required<DriftGuardOptions>;
  private readonly recentToolSignatures: string[] = [];
  private totalToolCalls = 0;

  /** 初始化漂移检测阈值。 */
  constructor(options: DriftGuardOptions = {}) {
    this.options = {
      ...defaultDriftGuardOptions,
      ...options,
    };
  }

  /** 记录一批工具调用，并检查工具总数和重复调用窗口。 */
  recordToolCalls(toolCalls: ToolCall[]): void {
    for (const toolCall of toolCalls) {
      this.totalToolCalls++;

      if (this.totalToolCalls > this.options.maxToolCalls) {
        throw new RuntimeDriftError(
          `tool call limit exceeded (${this.totalToolCalls}/${this.options.maxToolCalls})`,
        );
      }

      const signature = createToolSignature(toolCall);
      this.recentToolSignatures.push(signature);

      while (this.recentToolSignatures.length > this.options.repeatedToolWindow) {
        this.recentToolSignatures.shift();
      }

      const repeatedCount = this.recentToolSignatures.filter(
        (item) => item === signature,
      ).length;
      if (repeatedCount >= this.options.repeatedToolThreshold) {
        throw new RuntimeDriftError(
          `repeated tool call ${signature} reached threshold ${this.options.repeatedToolThreshold}`,
        );
      }
    }
  }
}
