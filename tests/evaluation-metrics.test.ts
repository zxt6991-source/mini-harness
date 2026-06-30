import { describe, expect, it } from 'vitest';
import {
  aggregateEvaluationResults,
  checkEvaluationRegression,
  evaluateEngineRun,
} from '../src/evaluation';
import type { EngineEvent } from '../src/runtime/events';
import { createEngineEvent } from '../src/runtime/events';
import type { RunSnapshot } from '../src/runtime/state';

function snapshot(): RunSnapshot {
  return {
    sessionId: 'session_1',
    traceId: 'trace_1',
    step: 0,
    messageCount: 1,
    modelCallCount: 0,
    toolCallCount: 0,
    estimatedTokens: 0,
    usedTokens: 0,
    elapsedMs: 0,
  };
}

function at(event: EngineEvent, timestamp: number): EngineEvent {
  return { ...event, timestamp };
}

describe('evaluation metrics', () => {
  it('computes step, trajectory, task, and cost metrics from engine events', () => {
    const base = snapshot();
    const events: EngineEvent[] = [
      at(
        createEngineEvent({
          type: 'agent_start',
          sessionId: 'session_1',
          traceId: 'trace_1',
          inputLength: 12,
          snapshot: base,
        }),
        1_000,
      ),
      at(
        createEngineEvent({
          type: 'model_message',
          sessionId: 'session_1',
          traceId: 'trace_1',
          message: {
            id: 'assistant_1',
            role: 'assistant',
            content: 'call tools',
            createdAt: 1_001,
            toolCalls: [
              {
                id: 'call_1',
                name: 'read_file',
                arguments: { path: 'input.txt' },
              },
              {
                id: 'call_2',
                name: 'write_file',
                arguments: { path: 'wrong.md' },
              },
            ],
          },
          usage: {
            inputTokens: 70,
            outputTokens: 20,
            totalTokens: 90,
          },
          snapshot: base,
        }),
        1_010,
      ),
      at(
        createEngineEvent({
          type: 'tool_result',
          sessionId: 'session_1',
          traceId: 'trace_1',
          toolCallId: 'call_1',
          toolName: 'read_file',
          success: true,
          latencyMs: 8,
          snapshot: base,
        }),
        1_020,
      ),
      at(
        createEngineEvent({
          type: 'tool_result',
          sessionId: 'session_1',
          traceId: 'trace_1',
          toolCallId: 'call_2',
          toolName: 'write_file',
          success: true,
          latencyMs: 12,
          snapshot: base,
        }),
        1_030,
      ),
      at(
        createEngineEvent({
          type: 'model_message',
          sessionId: 'session_1',
          traceId: 'trace_1',
          message: {
            id: 'assistant_2',
            role: 'assistant',
            content: 'summary complete',
            createdAt: 1_040,
          },
          usage: {
            inputTokens: 30,
            outputTokens: 40,
            totalTokens: 70,
          },
          snapshot: base,
        }),
        1_040,
      ),
      at(
        createEngineEvent({
          type: 'agent_end',
          sessionId: 'session_1',
          traceId: 'trace_1',
          message: {
            id: 'assistant_2',
            role: 'assistant',
            content: 'summary complete',
            createdAt: 1_040,
          },
          steps: 2,
          snapshot: base,
        }),
        1_050,
      ),
    ];

    const result = evaluateEngineRun(events, {
      expectedToolCalls: [
        { toolName: 'read_file', arguments: { path: 'input.txt' } },
        { toolName: 'write_file', arguments: { path: 'summary.md' } },
      ],
      optimalToolNames: ['read_file', 'write_file'],
      finalContentIncludes: 'summary complete',
      costPer1KTokens: {
        input: 0.001,
        output: 0.002,
      },
      costReferenceUsd: 0.00044,
    });

    expect(result.step).toMatchObject({
      toolAccuracy: 1,
      parameterAccuracy: 0.5,
      executionSuccessRate: 1,
    });
    expect(result.trajectory).toMatchObject({
      trajectoryEfficiency: 1,
      duplicateRate: 0,
      errorRecoveryRate: 0,
      actualToolCalls: 2,
      optimalToolCalls: 2,
    });
    expect(result.task).toMatchObject({
      success: true,
      successRate: 1,
      durationMs: 50,
      inputTokens: 100,
      outputTokens: 60,
      totalTokens: 160,
    });
    expect(result.task.costUsd).toBeCloseTo(0.00022);
    expect(result.overallScore).toBeCloseTo(90);
  });

  it('captures trajectory inefficiency, duplicate calls, and error recovery', () => {
    const base = snapshot();
    const events: EngineEvent[] = [
      at(
        createEngineEvent({
          type: 'agent_start',
          sessionId: 'session_1',
          traceId: 'trace_1',
          inputLength: 12,
          snapshot: base,
        }),
        2_000,
      ),
      at(
        createEngineEvent({
          type: 'tool_result',
          sessionId: 'session_1',
          traceId: 'trace_1',
          toolCallId: 'call_1',
          toolName: 'search',
          success: false,
          latencyMs: 20,
          errorCode: 'UPSTREAM_RATE_LIMIT',
          retryable: true,
          snapshot: base,
        }),
        2_010,
      ),
      at(
        createEngineEvent({
          type: 'tool_result',
          sessionId: 'session_1',
          traceId: 'trace_1',
          toolCallId: 'call_2',
          toolName: 'search',
          success: true,
          latencyMs: 15,
          snapshot: base,
        }),
        2_020,
      ),
      at(
        createEngineEvent({
          type: 'tool_result',
          sessionId: 'session_1',
          traceId: 'trace_1',
          toolCallId: 'call_3',
          toolName: 'summarize',
          success: true,
          latencyMs: 10,
          snapshot: base,
        }),
        2_030,
      ),
    ];

    const result = evaluateEngineRun(events, {
      optimalToolNames: ['search', 'summarize'],
    });

    expect(result.step.executionSuccessRate).toBeCloseTo(2 / 3);
    expect(result.trajectory).toMatchObject({
      actualToolCalls: 3,
      optimalToolCalls: 2,
      duplicateRate: 1 / 3,
      errorRecoveryRate: 1,
    });
    expect(result.trajectory.trajectoryEfficiency).toBeCloseTo(2 / 3);
  });

  it('aggregates runs and reports threshold-based regressions', () => {
    const passing = evaluateEngineRun(
      [
        at(
          createEngineEvent({
            type: 'agent_start',
            sessionId: 'session_1',
            traceId: 'trace_1',
            inputLength: 1,
            snapshot: snapshot(),
          }),
          1_000,
        ),
        at(
          createEngineEvent({
            type: 'agent_end',
            sessionId: 'session_1',
            traceId: 'trace_1',
            message: {
              id: 'assistant_1',
              role: 'assistant',
              content: 'ok',
              createdAt: 1_100,
            },
            steps: 1,
            snapshot: snapshot(),
          }),
          1_100,
        ),
      ],
      { finalContentIncludes: 'ok' },
    );
    const failing = evaluateEngineRun(
      [
        at(
          createEngineEvent({
            type: 'agent_start',
            sessionId: 'session_2',
            traceId: 'trace_2',
            inputLength: 1,
            snapshot: snapshot(),
          }),
          2_000,
        ),
        at(
          createEngineEvent({
            type: 'runtime_error',
            sessionId: 'session_2',
            traceId: 'trace_2',
            phase: 'termination',
            errorCode: 'MAX_STEPS_EXCEEDED',
            retryable: false,
            message: 'too many steps',
            snapshot: snapshot(),
          }),
          2_400,
        ),
      ],
      { finalContentIncludes: 'ok' },
    );

    const aggregate = aggregateEvaluationResults([passing, failing]);
    const regressions = checkEvaluationRegression(
      {
        ...aggregate,
        task: {
          ...aggregate.task,
          successRate: 0.88,
          avgDurationMs: 1_400,
        },
        overallScore: 81,
      },
      {
        ...aggregate,
        task: {
          ...aggregate.task,
          successRate: 0.95,
          avgDurationMs: 1_000,
        },
        overallScore: 90,
      },
      {
        allowedRelativeDrop: 0.05,
        allowedRelativeIncrease: 0.1,
      },
    );

    expect(aggregate.task.successRate).toBe(0.5);
    expect(aggregate.task.avgDurationMs).toBe(250);
    expect(regressions.map((item) => item.metric)).toEqual([
      'task.successRate',
      'task.avgDurationMs',
      'overallScore',
    ]);
  });
});
