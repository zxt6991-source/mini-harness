import { describe, expect, it } from 'vitest';
import {
  ChatCompletionsProvider,
  ConsolidatingMemory,
  ModelOutputGovernance,
  MarkdownMemoryStore,
  ProviderRouter,
  ReasoningBudgetManager,
  createModelProvider,
  createMemory,
  evaluateOutput,
  loadHarnessConfig,
  parseChatCompletionResponse,
  suggestToolName,
} from '../src';

describe('public exports', () => {
  it('exports chat completions integration APIs', () => {
    expect(ChatCompletionsProvider).toBeTypeOf('function');
    expect(ConsolidatingMemory).toBeTypeOf('function');
    expect(MarkdownMemoryStore).toBeTypeOf('function');
    expect(createModelProvider).toBeTypeOf('function');
    expect(createMemory).toBeTypeOf('function');
    expect(loadHarnessConfig).toBeTypeOf('function');
    expect(parseChatCompletionResponse).toBeTypeOf('function');
    expect(ModelOutputGovernance).toBeTypeOf('function');
    expect(ProviderRouter).toBeTypeOf('function');
    expect(ReasoningBudgetManager).toBeTypeOf('function');
    expect(evaluateOutput).toBeTypeOf('function');
    expect(suggestToolName).toBeTypeOf('function');
  });
});
