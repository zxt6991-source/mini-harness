// 该文件把 EngineEvent 轨迹转换为步骤、轨迹和任务三级评估指标。
import type { ToolCall } from '../core';
import type { EngineEvent, ModelMessageEvent, ToolResultEvent } from '../runtime/events';

export interface ExpectedToolCall {
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface EvaluationCostPer1KTokens {
  input: number;
  output: number;
}

export interface EngineRunEvaluationExpectations {
  expectedToolCalls?: ExpectedToolCall[];
  optimalToolNames?: string[];
  finalContentIncludes?: string;
  costPer1KTokens?: EvaluationCostPer1KTokens;
  costReferenceUsd?: number;
}

export interface StepEvaluationMetrics {
  toolAccuracy: number;
  parameterAccuracy: number;
  executionSuccessRate: number;
  evaluatedToolCalls: number;
  executedToolCalls: number;
}

export interface TrajectoryEvaluationMetrics {
  trajectoryEfficiency: number;
  duplicateRate: number;
  errorRecoveryRate: number;
  actualToolCalls: number;
  optimalToolCalls: number;
}

export interface TaskEvaluationMetrics {
  success: boolean;
  successRate: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  runtimeErrorCount: number;
}

export interface EngineRunEvaluationResult {
  step: StepEvaluationMetrics;
  trajectory: TrajectoryEvaluationMetrics;
  task: TaskEvaluationMetrics;
  overallScore: number;
  issues: string[];
}

export interface AggregatedStepEvaluationMetrics {
  toolAccuracy: number;
  parameterAccuracy: number;
  executionSuccessRate: number;
}

export interface AggregatedTrajectoryEvaluationMetrics {
  trajectoryEfficiency: number;
  duplicateRate: number;
  errorRecoveryRate: number;
  avgActualToolCalls: number;
  avgOptimalToolCalls: number;
}

export interface AggregatedTaskEvaluationMetrics {
  successRate: number;
  avgDurationMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgCostUsd: number;
}

export interface AggregatedEvaluationMetrics {
  sampleCount: number;
  step: AggregatedStepEvaluationMetrics;
  trajectory: AggregatedTrajectoryEvaluationMetrics;
  task: AggregatedTaskEvaluationMetrics;
  overallScore: number;
}

export interface EvaluationRegressionThresholds {
  allowedRelativeDrop?: number;
  allowedRelativeIncrease?: number;
}

export interface EvaluationRegression {
  metric: string;
  baseline: number;
  current: number;
  changeRatio: number;
  direction: 'higher_is_better' | 'lower_is_better';
}

/** 从单次 EngineEvent 轨迹计算三层评估指标。 */
export function evaluateEngineRun(
  events: EngineEvent[],
  expectations: EngineRunEvaluationExpectations = {},
): EngineRunEvaluationResult {
  const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const actualToolCalls = collectToolCalls(ordered);
  const toolResults = ordered.filter(isToolResultEvent);
  const expectedToolCalls = expectations.expectedToolCalls ?? [];
  const step = evaluateStep(actualToolCalls, toolResults, expectedToolCalls);
  const trajectory = evaluateTrajectory(
    toolResults,
    expectations.optimalToolNames ?? [],
  );
  const task = evaluateTask(ordered, expectations);
  const overallScore = computeOverallScore(step, trajectory, task, expectations);
  const issues = collectIssues(step, trajectory, task, expectations);

  return {
    step,
    trajectory,
    task,
    overallScore,
    issues,
  };
}

/** 聚合多次运行结果，生成测试集或 benchmark 级指标。 */
export function aggregateEvaluationResults(
  results: EngineRunEvaluationResult[],
): AggregatedEvaluationMetrics {
  if (results.length === 0) {
    return {
      sampleCount: 0,
      step: {
        toolAccuracy: 0,
        parameterAccuracy: 0,
        executionSuccessRate: 0,
      },
      trajectory: {
        trajectoryEfficiency: 0,
        duplicateRate: 0,
        errorRecoveryRate: 0,
        avgActualToolCalls: 0,
        avgOptimalToolCalls: 0,
      },
      task: {
        successRate: 0,
        avgDurationMs: 0,
        avgInputTokens: 0,
        avgOutputTokens: 0,
        avgTotalTokens: 0,
        avgCostUsd: 0,
      },
      overallScore: 0,
    };
  }

  return {
    sampleCount: results.length,
    step: {
      toolAccuracy: average(results.map((result) => result.step.toolAccuracy)),
      parameterAccuracy: average(results.map((result) => result.step.parameterAccuracy)),
      executionSuccessRate: average(
        results.map((result) => result.step.executionSuccessRate),
      ),
    },
    trajectory: {
      trajectoryEfficiency: average(
        results.map((result) => result.trajectory.trajectoryEfficiency),
      ),
      duplicateRate: average(results.map((result) => result.trajectory.duplicateRate)),
      errorRecoveryRate: average(
        results.map((result) => result.trajectory.errorRecoveryRate),
      ),
      avgActualToolCalls: average(
        results.map((result) => result.trajectory.actualToolCalls),
      ),
      avgOptimalToolCalls: average(
        results.map((result) => result.trajectory.optimalToolCalls),
      ),
    },
    task: {
      successRate: average(results.map((result) => result.task.successRate)),
      avgDurationMs: average(results.map((result) => result.task.durationMs)),
      avgInputTokens: average(results.map((result) => result.task.inputTokens)),
      avgOutputTokens: average(results.map((result) => result.task.outputTokens)),
      avgTotalTokens: average(results.map((result) => result.task.totalTokens)),
      avgCostUsd: average(results.map((result) => result.task.costUsd)),
    },
    overallScore: average(results.map((result) => result.overallScore)),
  };
}

/** 对比当前聚合指标和基线指标，返回超过阈值的质量回归项。 */
export function checkEvaluationRegression(
  current: AggregatedEvaluationMetrics,
  baseline: AggregatedEvaluationMetrics,
  thresholds: EvaluationRegressionThresholds = {},
): EvaluationRegression[] {
  const allowedRelativeDrop = thresholds.allowedRelativeDrop ?? 0.05;
  const allowedRelativeIncrease = thresholds.allowedRelativeIncrease ?? 0.1;
  const regressions: EvaluationRegression[] = [];

  collectHigherIsBetterRegression(
    regressions,
    'task.successRate',
    current.task.successRate,
    baseline.task.successRate,
    allowedRelativeDrop,
  );
  collectHigherIsBetterRegression(
    regressions,
    'step.executionSuccessRate',
    current.step.executionSuccessRate,
    baseline.step.executionSuccessRate,
    allowedRelativeDrop,
  );
  collectHigherIsBetterRegression(
    regressions,
    'trajectory.trajectoryEfficiency',
    current.trajectory.trajectoryEfficiency,
    baseline.trajectory.trajectoryEfficiency,
    allowedRelativeDrop,
  );
  collectLowerIsBetterRegression(
    regressions,
    'task.avgDurationMs',
    current.task.avgDurationMs,
    baseline.task.avgDurationMs,
    allowedRelativeIncrease,
  );
  collectLowerIsBetterRegression(
    regressions,
    'task.avgCostUsd',
    current.task.avgCostUsd,
    baseline.task.avgCostUsd,
    allowedRelativeIncrease,
  );
  collectLowerIsBetterRegression(
    regressions,
    'trajectory.duplicateRate',
    current.trajectory.duplicateRate,
    baseline.trajectory.duplicateRate,
    allowedRelativeIncrease,
  );
  collectHigherIsBetterRegression(
    regressions,
    'overallScore',
    current.overallScore,
    baseline.overallScore,
    allowedRelativeDrop,
  );

  return regressions;
}

function evaluateStep(
  actualToolCalls: ToolCall[],
  toolResults: ToolResultEvent[],
  expectedToolCalls: ExpectedToolCall[],
): StepEvaluationMetrics {
  const expectedCount = expectedToolCalls.length;
  const successfulExecutions = toolResults.filter((event) => event.success).length;

  if (expectedCount === 0) {
    return {
      toolAccuracy: 0,
      parameterAccuracy: 0,
      executionSuccessRate:
        toolResults.length > 0 ? successfulExecutions / toolResults.length : 0,
      evaluatedToolCalls: 0,
      executedToolCalls: toolResults.length,
    };
  }

  let correctTools = 0;
  let correctParameters = 0;

  expectedToolCalls.forEach((expected, index) => {
    const actual = actualToolCalls[index];
    const toolMatches = actual?.name === expected.toolName;

    if (toolMatches) {
      correctTools++;
    }

    if (
      toolMatches &&
      (expected.arguments === undefined ||
        stableStringify(actual.arguments) === stableStringify(expected.arguments))
    ) {
      correctParameters++;
    }
  });

  return {
    toolAccuracy: correctTools / expectedCount,
    parameterAccuracy: correctParameters / expectedCount,
    executionSuccessRate:
      toolResults.length > 0 ? successfulExecutions / toolResults.length : 0,
    evaluatedToolCalls: expectedCount,
    executedToolCalls: toolResults.length,
  };
}

function evaluateTrajectory(
  toolResults: ToolResultEvent[],
  optimalToolNames: string[],
): TrajectoryEvaluationMetrics {
  const actualToolCalls = toolResults.length;
  const optimalToolCalls = optimalToolNames.length;
  const duplicateCalls = toolResults.filter((event, index) => {
    const previous = toolResults[index - 1];
    return previous !== undefined && previous.toolName === event.toolName;
  }).length;
  const failedCalls = toolResults.filter((event) => !event.success).length;
  const recoveredCalls = toolResults.filter((event, index) => {
    const next = toolResults[index + 1];
    return !event.success && next?.success === true;
  }).length;

  return {
    trajectoryEfficiency:
      actualToolCalls > 0 && optimalToolCalls > 0
        ? Math.min(1, optimalToolCalls / actualToolCalls)
        : 0,
    duplicateRate: actualToolCalls > 0 ? duplicateCalls / actualToolCalls : 0,
    errorRecoveryRate: failedCalls > 0 ? recoveredCalls / failedCalls : 0,
    actualToolCalls,
    optimalToolCalls,
  };
}

function evaluateTask(
  events: EngineEvent[],
  expectations: EngineRunEvaluationExpectations,
): TaskEvaluationMetrics {
  const firstTimestamp = events[0]?.timestamp ?? 0;
  const lastTimestamp = events.at(-1)?.timestamp ?? firstTimestamp;
  const finalEvent = findLastAgentEndEvent(events);
  const runtimeErrorCount = events.filter((event) => event.type === 'runtime_error').length;
  const finalContent = finalEvent?.message.content ?? '';
  const hasExpectedFinalContent =
    expectations.finalContentIncludes === undefined ||
    finalContent.includes(expectations.finalContentIncludes);
  const usage = events.filter(isModelMessageEvent).reduce(
    (accumulator, event) => {
      accumulator.inputTokens += event.usage?.inputTokens ?? 0;
      accumulator.outputTokens += event.usage?.outputTokens ?? 0;
      accumulator.totalTokens += event.usage?.totalTokens ?? 0;
      return accumulator;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  );
  const costUsd = expectations.costPer1KTokens
    ? (usage.inputTokens * expectations.costPer1KTokens.input +
        usage.outputTokens * expectations.costPer1KTokens.output) /
      1_000
    : 0;
  const success = finalEvent !== undefined && hasExpectedFinalContent;

  return {
    success,
    successRate: success ? 1 : 0,
    durationMs: Math.max(0, lastTimestamp - firstTimestamp),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    costUsd,
    runtimeErrorCount,
  };
}

function computeOverallScore(
  step: StepEvaluationMetrics,
  trajectory: TrajectoryEvaluationMetrics,
  task: TaskEvaluationMetrics,
  expectations: EngineRunEvaluationExpectations,
): number {
  const stepScore =
    step.evaluatedToolCalls > 0
      ? (step.toolAccuracy + step.parameterAccuracy) / 2
      : step.executionSuccessRate;
  const costReference = expectations.costReferenceUsd ?? 0.01;
  const costScore =
    expectations.costPer1KTokens === undefined
      ? 1
      : Math.max(0, 1 - task.costUsd / costReference);
  const score =
    task.successRate * 40 +
    trajectory.trajectoryEfficiency * 30 +
    stepScore * 20 +
    costScore * 10;

  return clamp(score, 0, 100);
}

function collectIssues(
  step: StepEvaluationMetrics,
  trajectory: TrajectoryEvaluationMetrics,
  task: TaskEvaluationMetrics,
  expectations: EngineRunEvaluationExpectations,
): string[] {
  const issues: string[] = [];

  if (!task.success) {
    issues.push('task_failed');
  }

  if (
    expectations.expectedToolCalls !== undefined &&
    step.toolAccuracy < 1
  ) {
    issues.push('tool_selection_mismatch');
  }

  if (
    expectations.expectedToolCalls !== undefined &&
    step.parameterAccuracy < 1
  ) {
    issues.push('tool_parameter_mismatch');
  }

  if (step.executionSuccessRate < 1) {
    issues.push('tool_execution_failure');
  }

  if (trajectory.duplicateRate > 0) {
    issues.push('duplicate_tool_calls');
  }

  return issues;
}

function collectToolCalls(events: EngineEvent[]): ToolCall[] {
  return events.filter(isModelMessageEvent).flatMap((event) => event.message.toolCalls ?? []);
}

function collectHigherIsBetterRegression(
  regressions: EvaluationRegression[],
  metric: string,
  current: number,
  baseline: number,
  threshold: number,
): void {
  if (baseline <= 0) {
    return;
  }

  const changeRatio = (baseline - current) / baseline;
  if (changeRatio > threshold) {
    regressions.push({
      metric,
      baseline,
      current,
      changeRatio,
      direction: 'higher_is_better',
    });
  }
}

function collectLowerIsBetterRegression(
  regressions: EvaluationRegression[],
  metric: string,
  current: number,
  baseline: number,
  threshold: number,
): void {
  if (baseline <= 0) {
    return;
  }

  const changeRatio = (current - baseline) / baseline;
  if (changeRatio > threshold) {
    regressions.push({
      metric,
      baseline,
      current,
      changeRatio,
      direction: 'lower_is_better',
    });
  }
}

function isModelMessageEvent(event: EngineEvent): event is ModelMessageEvent {
  return event.type === 'model_message';
}

function isToolResultEvent(event: EngineEvent): event is ToolResultEvent {
  return event.type === 'tool_result';
}

function findLastAgentEndEvent(events: EngineEvent[]): Extract<EngineEvent, { type: 'agent_end' }> | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type === 'agent_end') {
      return event;
    }
  }

  return undefined;
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}
