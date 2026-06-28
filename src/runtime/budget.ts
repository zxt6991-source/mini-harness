// 该文件提供运行时预算控制，限制单个任务的模型调用次数和估算 token 消耗。
import type { Message, TokenUsage } from '../core';
import { MiniHarnessError } from '../core';

export interface RuntimeBudget {
  maxModelCalls: number;
  maxEstimatedTokens: number;
  maxContextCharacters: number;
  reserveOutputTokens: number;
}

export interface BudgetCheckInput {
  messages: Message[];
  modelCallCount: number;
  usedTokens: number;
}

export interface BudgetCheckResult {
  estimatedTokens: number;
}

export const defaultRuntimeBudget: RuntimeBudget = {
  maxModelCalls: Number.POSITIVE_INFINITY,
  maxEstimatedTokens: Number.POSITIVE_INFINITY,
  maxContextCharacters: Number.POSITIVE_INFINITY,
  reserveOutputTokens: 0,
};

/** 表示运行时预算已耗尽，继续调用模型会违反任务级资源限制。 */
export class RuntimeBudgetExceededError extends MiniHarnessError {
  /** 创建带原因说明的预算超限错误。 */
  constructor(reason: string) {
    super(`Runtime budget exceeded: ${reason}`, 'RUNTIME_BUDGET_EXCEEDED');
  }
}

/** 使用字符数粗略估算消息 token 数，避免引入 provider 专属 tokenizer。 */
export function estimateMessageTokens(message: Message): number {
  return Math.ceil(message.content.length / 4);
}

/** 估算一组消息的 token 数。 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

/** 运行时预算管理器，负责请求前预算检查和 usage 累计。 */
export class BudgetManager {
  private readonly budget: RuntimeBudget;
  private recordedTokens = 0;

  /** 初始化预算配置，未设置的字段使用不限制的默认值。 */
  constructor(budget: Partial<RuntimeBudget> = {}) {
    this.budget = {
      ...defaultRuntimeBudget,
      ...budget,
    };
  }

  /** 在模型调用前检查调用次数、上下文字符数和估算 token 是否仍在预算内。 */
  checkBeforeModelCall(input: BudgetCheckInput): BudgetCheckResult {
    if (input.modelCallCount >= this.budget.maxModelCalls) {
      throw new RuntimeBudgetExceededError(
        `model call limit reached (${input.modelCallCount}/${this.budget.maxModelCalls})`,
      );
    }

    const contextCharacters = input.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (contextCharacters > this.budget.maxContextCharacters) {
      throw new RuntimeBudgetExceededError(
        `context characters ${contextCharacters} exceed ${this.budget.maxContextCharacters}`,
      );
    }

    const estimatedTokens =
      estimateMessagesTokens(input.messages) + this.budget.reserveOutputTokens;
    const totalTokens = this.recordedTokens + estimatedTokens;
    if (totalTokens > this.budget.maxEstimatedTokens) {
      throw new RuntimeBudgetExceededError(
        `estimated tokens ${totalTokens} exceed ${this.budget.maxEstimatedTokens}`,
      );
    }

    return { estimatedTokens };
  }

  /** 记录模型返回的真实 usage，后续预算检查优先计入该值。 */
  recordUsage(usage: TokenUsage | undefined): void {
    if (!usage) {
      return;
    }

    this.recordedTokens += usage.totalTokens;
  }
}
