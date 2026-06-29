// 该文件把 Engine 事件汇总为生产运行指标快照。
import type { EngineEvent } from '../runtime/events';

export interface ProductionMetricsSnapshot {
  model: {
    callCount: number;
  };
  tools: {
    callCount: number;
    successCount: number;
    errorCount: number;
    totalLatencyMs: number;
    maxLatencyMs: number;
    averageLatencyMs: number;
  };
  tokens: {
    input: number;
    output: number;
    total: number;
    cachedInput: number;
    reasoning: number;
  };
  runtime: {
    startedRuns: number;
    completedRuns: number;
    errorCount: number;
    turnCount: number;
    maxStep: number;
  };
}

export class ProductionMetricsCollector {
  private modelCallCount = 0;
  private toolCallCount = 0;
  private toolSuccessCount = 0;
  private toolErrorCount = 0;
  private totalToolLatencyMs = 0;
  private maxToolLatencyMs = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private totalTokens = 0;
  private cachedInputTokens = 0;
  private reasoningTokens = 0;
  private startedRuns = 0;
  private completedRuns = 0;
  private runtimeErrorCount = 0;
  private turnCount = 0;
  private maxStep = 0;

  record(event: EngineEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.startedRuns++;
        break;
      case 'model_start':
        this.modelCallCount++;
        break;
      case 'model_message':
        if (event.usage) {
          this.inputTokens += event.usage.inputTokens;
          this.outputTokens += event.usage.outputTokens;
          this.totalTokens += event.usage.totalTokens;
          this.cachedInputTokens += event.usage.cachedInputTokens ?? 0;
          this.reasoningTokens += event.usage.reasoningTokens ?? 0;
        }
        break;
      case 'tool_result':
        this.toolCallCount++;
        this.totalToolLatencyMs += event.latencyMs;
        this.maxToolLatencyMs = Math.max(this.maxToolLatencyMs, event.latencyMs);
        if (event.success) {
          this.toolSuccessCount++;
        } else {
          this.toolErrorCount++;
        }
        break;
      case 'runtime_error':
        this.runtimeErrorCount++;
        break;
      case 'turn_end':
        this.turnCount++;
        this.maxStep = Math.max(this.maxStep, event.step + 1);
        break;
      case 'agent_end':
        this.completedRuns++;
        this.maxStep = Math.max(this.maxStep, event.steps);
        break;
      default:
        break;
    }
  }

  snapshot(): ProductionMetricsSnapshot {
    return {
      model: {
        callCount: this.modelCallCount,
      },
      tools: {
        callCount: this.toolCallCount,
        successCount: this.toolSuccessCount,
        errorCount: this.toolErrorCount,
        totalLatencyMs: this.totalToolLatencyMs,
        maxLatencyMs: this.maxToolLatencyMs,
        averageLatencyMs:
          this.toolCallCount > 0 ? this.totalToolLatencyMs / this.toolCallCount : 0,
      },
      tokens: {
        input: this.inputTokens,
        output: this.outputTokens,
        total: this.totalTokens,
        cachedInput: this.cachedInputTokens,
        reasoning: this.reasoningTokens,
      },
      runtime: {
        startedRuns: this.startedRuns,
        completedRuns: this.completedRuns,
        errorCount: this.runtimeErrorCount,
        turnCount: this.turnCount,
        maxStep: this.maxStep,
      },
    };
  }
}
