// 该文件提供 provider-neutral reasoning 策略决策和会话级 reasoning token 统计。
import type { ReasoningOptions, TokenUsage } from '../core';

export type TaskComplexity = 'easy' | 'medium' | 'hard' | 'very_hard';

export interface ReasoningBudgetConfig {
  strategy: ReasoningOptions['strategy'];
  complexityThreshold?: TaskComplexity;
  maxReasoningTokensPerSession?: number;
}

const complexityOrder: TaskComplexity[] = ['easy', 'medium', 'hard', 'very_hard'];

/** 根据配置和已用 reasoning token，决定下一次模型调用是否启用 reasoning。 */
export class ReasoningBudgetManager {
  private reasoningTokens = 0;

  constructor(private readonly config: ReasoningBudgetConfig) {}

  resolveOptions(complexity: TaskComplexity): ReasoningOptions {
    if (this.config.strategy === 'disabled') {
      return { strategy: 'disabled' };
    }

    if (this.config.strategy === 'required') {
      return { strategy: 'required', effort: 'high' };
    }

    if (this.config.strategy === 'adaptive') {
      return { strategy: 'adaptive', effort: 'medium' };
    }

    const threshold = this.config.complexityThreshold ?? 'medium';
    const limit =
      this.config.maxReasoningTokensPerSession ?? Number.POSITIVE_INFINITY;
    const complexEnough =
      complexityOrder.indexOf(complexity) >= complexityOrder.indexOf(threshold);

    if (complexEnough && this.reasoningTokens < limit) {
      return { strategy: 'adaptive', effort: 'medium' };
    }

    return { strategy: 'disabled' };
  }

  recordUsage(usage: TokenUsage | undefined): void {
    this.reasoningTokens += usage?.reasoningTokens ?? 0;
  }

  getStatus(): { reasoningTokens: number } {
    return { reasoningTokens: this.reasoningTokens };
  }
}
