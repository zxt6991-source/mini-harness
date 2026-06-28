import { describe, expect, it } from 'vitest';
import { ReasoningBudgetManager } from '../src/models/reasoning-budget';

describe('ReasoningBudgetManager', () => {
  it('disables reasoning when strategy is disabled', () => {
    const manager = new ReasoningBudgetManager({ strategy: 'disabled' });

    expect(manager.resolveOptions('hard')).toEqual({ strategy: 'disabled' });
  });

  it('enables adaptive reasoning for hard tasks under budget', () => {
    const manager = new ReasoningBudgetManager({
      strategy: 'budget_based',
      complexityThreshold: 'medium',
      maxReasoningTokensPerSession: 1000,
    });

    expect(manager.resolveOptions('hard')).toEqual({
      strategy: 'adaptive',
      effort: 'medium',
    });
  });

  it('records reasoning token usage', () => {
    const manager = new ReasoningBudgetManager({
      strategy: 'budget_based',
      maxReasoningTokensPerSession: 100,
    });

    manager.recordUsage({
      inputTokens: 1,
      outputTokens: 20,
      totalTokens: 21,
      reasoningTokens: 10,
    });

    expect(manager.getStatus()).toMatchObject({ reasoningTokens: 10 });
  });
});
