import { describe, expect, it } from 'vitest';
import {
  ChatCompletionsProvider,
  ConsolidatingMemory,
  FileCheckpointStore,
  ModelOutputGovernance,
  OrchestrationEngine,
  OrchestrationMessageBus,
  MarkdownMemoryStore,
  PersistentToolSchemaCache,
  ProviderRouter,
  ReasoningBudgetManager,
  Scratchpad,
  WorkflowStateMachine,
  aggregateEvaluationResults,
  checkEvaluationRegression,
  createGracefulShutdownController,
  createHarness,
  createMiniHarnessFetchHandler,
  createModelProvider,
  createMemory,
  evaluateEngineRun,
  evaluateOutput,
  normalizeTaskSpec,
  loadHarnessConfig,
  parseChatCompletionResponse,
  suggestToolName,
} from '../src';

describe('public exports', () => {
  it('exports chat completions integration APIs', () => {
    expect(ChatCompletionsProvider).toBeTypeOf('function');
    expect(ConsolidatingMemory).toBeTypeOf('function');
    expect(FileCheckpointStore).toBeTypeOf('function');
    expect(MarkdownMemoryStore).toBeTypeOf('function');
    expect(PersistentToolSchemaCache).toBeTypeOf('function');
    expect(createMiniHarnessFetchHandler).toBeTypeOf('function');
    expect(createGracefulShutdownController).toBeTypeOf('function');
    expect(createHarness).toBeTypeOf('function');
    expect(createModelProvider).toBeTypeOf('function');
    expect(createMemory).toBeTypeOf('function');
    expect(loadHarnessConfig).toBeTypeOf('function');
    expect(parseChatCompletionResponse).toBeTypeOf('function');
    expect(ModelOutputGovernance).toBeTypeOf('function');
    expect(ProviderRouter).toBeTypeOf('function');
    expect(ReasoningBudgetManager).toBeTypeOf('function');
    expect(OrchestrationEngine).toBeTypeOf('function');
    expect(OrchestrationMessageBus).toBeTypeOf('function');
    expect(Scratchpad).toBeTypeOf('function');
    expect(WorkflowStateMachine).toBeTypeOf('function');
    expect(normalizeTaskSpec).toBeTypeOf('function');
    expect(evaluateOutput).toBeTypeOf('function');
    expect(evaluateEngineRun).toBeTypeOf('function');
    expect(aggregateEvaluationResults).toBeTypeOf('function');
    expect(checkEvaluationRegression).toBeTypeOf('function');
    expect(suggestToolName).toBeTypeOf('function');
  });
});
