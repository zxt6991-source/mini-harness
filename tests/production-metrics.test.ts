import { describe, expect, it } from 'vitest';
import type {
  Message,
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';
import { ProductionMetricsCollector } from '../src/production/metrics';
import { Engine } from '../src/runtime/engine';
import { createEngineEvent } from '../src/runtime/events';
import type { RunSnapshot } from '../src/runtime/state';
import { EchoTool } from '../src/tools/builtin/echo';
import { DefaultToolRegistry } from '../src/tools/registry';

class SequenceProvider implements ModelProvider {
  name = 'sequence';
  calls: ModelChatInput[] = [];

  constructor(private readonly outputs: Message[]) {}

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    this.calls.push(input);
    const message = this.outputs.shift();

    if (!message) {
      throw new Error('No model output configured');
    }

    return {
      message,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    };
  }
}

function assistant(content: string, toolCalls: Message['toolCalls'] = []): Message {
  return {
    id: `assistant_${content}`,
    role: 'assistant',
    content,
    toolCalls,
    createdAt: Date.now(),
  };
}

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

describe('ProductionMetricsCollector', () => {
  it('records model, tool, token, and latency metrics from engine events', async () => {
    const metrics = new ProductionMetricsCollector();
    const provider = new SequenceProvider([
      assistant('call tool', [
        {
          id: 'call_1',
          name: 'echo',
          arguments: { text: 'from tool' },
        },
      ]),
      assistant('final'),
    ]);
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const engine = new Engine(provider, new InMemoryStore(), registry, {
      maxSteps: 4,
      requestTimeoutMs: 1_000,
      enableStream: false,
      metrics,
    });

    await engine.run('hello', 'session_1');

    expect(metrics.snapshot()).toMatchObject({
      model: {
        callCount: 2,
      },
      tools: {
        callCount: 1,
        successCount: 1,
        errorCount: 0,
      },
      tokens: {
        input: 20,
        output: 10,
        total: 30,
      },
      runtime: {
        completedRuns: 1,
        errorCount: 0,
      },
    });
    expect(metrics.snapshot().tools.maxLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports percentile latency, error buckets, and degraded health', () => {
    const metrics = new ProductionMetricsCollector({
      latencyWarningMs: 50,
      errorRateWarningThreshold: 0.25,
    });
    const base = snapshot();

    metrics.record(
      createEngineEvent({
        type: 'agent_start',
        sessionId: 'session_1',
        traceId: 'trace_1',
        inputLength: 5,
        snapshot: base,
      }),
    );
    metrics.record(
      createEngineEvent({
        type: 'tool_result',
        sessionId: 'session_1',
        traceId: 'trace_1',
        toolCallId: 'call_1',
        toolName: 'fast',
        success: true,
        latencyMs: 10,
        snapshot: base,
      }),
    );
    metrics.record(
      createEngineEvent({
        type: 'tool_result',
        sessionId: 'session_1',
        traceId: 'trace_1',
        toolCallId: 'call_2',
        toolName: 'slow',
        success: false,
        latencyMs: 120,
        errorCode: 'TOOL_TIMEOUT',
        errorName: 'ToolTimeoutError',
        retryable: true,
        snapshot: base,
      }),
    );

    expect(metrics.snapshot()).toMatchObject({
      tools: {
        callCount: 2,
        successCount: 1,
        errorCount: 1,
        successRate: 0.5,
        errorRate: 0.5,
        p99LatencyMs: 120,
        errorsByCode: {
          TOOL_TIMEOUT: 1,
        },
      },
      runtime: {
        startedRuns: 1,
      },
      health: {
        status: 'critical',
        alerts: expect.arrayContaining([
          expect.objectContaining({
            level: 'critical',
            code: 'tool_error_rate_high',
          }),
          expect.objectContaining({
            level: 'warning',
            code: 'tool_latency_high',
          }),
        ]),
      },
    });
  });

  it('summarizes continuous quality signals from runtime events', () => {
    const metrics = new ProductionMetricsCollector();
    const base = snapshot();

    metrics.record(
      createEngineEvent({
        type: 'agent_start',
        sessionId: 'session_1',
        traceId: 'trace_1',
        inputLength: 5,
        snapshot: base,
      }),
    );
    metrics.record(
      createEngineEvent({
        type: 'model_message',
        sessionId: 'session_1',
        traceId: 'trace_1',
        message: {
          id: 'assistant_1',
          role: 'assistant',
          content: 'call tools',
          createdAt: Date.now(),
        },
        usage: {
          inputTokens: 90,
          outputTokens: 30,
          totalTokens: 120,
        },
        snapshot: base,
      }),
    );
    metrics.record(
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
    );
    metrics.record(
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
    );
    metrics.record(
      createEngineEvent({
        type: 'agent_end',
        sessionId: 'session_1',
        traceId: 'trace_1',
        message: {
          id: 'assistant_2',
          role: 'assistant',
          content: 'done',
          createdAt: Date.now(),
        },
        steps: 2,
        snapshot: base,
      }),
    );
    metrics.record(
      createEngineEvent({
        type: 'agent_start',
        sessionId: 'session_2',
        traceId: 'trace_2',
        inputLength: 5,
        snapshot: base,
      }),
    );
    metrics.record(
      createEngineEvent({
        type: 'model_message',
        sessionId: 'session_2',
        traceId: 'trace_2',
        message: {
          id: 'assistant_3',
          role: 'assistant',
          content: 'still working',
          createdAt: Date.now(),
        },
        usage: {
          inputTokens: 45,
          outputTokens: 15,
          totalTokens: 60,
        },
        snapshot: base,
      }),
    );
    metrics.record(
      createEngineEvent({
        type: 'runtime_error',
        sessionId: 'session_2',
        traceId: 'trace_2',
        phase: 'termination',
        errorCode: 'MAX_STEPS_EXCEEDED',
        retryable: false,
        message: 'too many steps',
        snapshot: base,
      }),
    );

    const quality = metrics.snapshot().quality;

    expect(quality).toMatchObject({
      taskSuccessRate: 0.5,
      averageTokensPerRun: 90,
      errorRecoveryRate: 1,
      duplicateToolCallRate: 0.5,
    });
    expect(quality.averageRunDurationMs).toBeGreaterThanOrEqual(0);
  });
});
