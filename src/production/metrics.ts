// 该文件把 Engine 事件汇总为生产运行指标快照。
import type { EngineEvent } from '../runtime/events';

export type ProductionHealthStatus = 'healthy' | 'degraded' | 'critical';
export type ProductionAlertLevel = 'warning' | 'critical';

export interface ProductionMetricsCollectorOptions {
  latencyWarningMs?: number;
  errorRateWarningThreshold?: number;
}

export interface ProductionHealthAlert {
  level: ProductionAlertLevel;
  code: string;
  message: string;
  value: number;
  threshold: number;
}

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
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    successRate: number;
    errorRate: number;
    errorsByCode: Record<string, number>;
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
    completionRate: number;
  };
  quality: {
    taskSuccessRate: number;
    averageRunDurationMs: number;
    averageTokensPerRun: number;
    errorRecoveryRate: number;
    duplicateToolCallRate: number;
  };
  health: {
    status: ProductionHealthStatus;
    alerts: ProductionHealthAlert[];
  };
}

export class ProductionMetricsCollector {
  private readonly latencyWarningMs: number;
  private readonly errorRateWarningThreshold: number;
  private modelCallCount = 0;
  private toolCallCount = 0;
  private toolSuccessCount = 0;
  private toolErrorCount = 0;
  private totalToolLatencyMs = 0;
  private maxToolLatencyMs = 0;
  private readonly toolLatencySamples: number[] = [];
  private readonly toolErrorsByCode = new Map<string, number>();
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
  private readonly runStartedAtByTraceId = new Map<string, number>();
  private readonly runDurationSamples: number[] = [];
  private readonly lastToolNameByTraceId = new Map<string, string>();
  private readonly lastToolFailedByTraceId = new Map<string, boolean>();
  private duplicateToolCallCount = 0;
  private failedToolCallCount = 0;
  private recoveredToolCallCount = 0;

  constructor(options: ProductionMetricsCollectorOptions = {}) {
    this.latencyWarningMs = options.latencyWarningMs ?? 2_000;
    this.errorRateWarningThreshold = options.errorRateWarningThreshold ?? 0.01;
  }

  record(event: EngineEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.startedRuns++;
        this.runStartedAtByTraceId.set(event.traceId, event.timestamp);
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
        this.toolLatencySamples.push(event.latencyMs);
        if (this.lastToolNameByTraceId.get(event.traceId) === event.toolName) {
          this.duplicateToolCallCount++;
        }
        if (event.success && this.lastToolFailedByTraceId.get(event.traceId) === true) {
          this.recoveredToolCallCount++;
        }
        if (!event.success) {
          this.failedToolCallCount++;
        }
        this.lastToolNameByTraceId.set(event.traceId, event.toolName);
        this.lastToolFailedByTraceId.set(event.traceId, !event.success);
        if (event.success) {
          this.toolSuccessCount++;
        } else {
          this.toolErrorCount++;
          const errorCode = event.errorCode ?? 'UNKNOWN';
          this.toolErrorsByCode.set(
            errorCode,
            (this.toolErrorsByCode.get(errorCode) ?? 0) + 1,
          );
        }
        break;
      case 'runtime_error':
        this.runtimeErrorCount++;
        if (event.metadata?.willRetry !== true) {
          this.clearTraceState(event.traceId);
        }
        break;
      case 'turn_end':
        this.turnCount++;
        this.maxStep = Math.max(this.maxStep, event.step + 1);
        break;
      case 'agent_end':
        this.completedRuns++;
        this.maxStep = Math.max(this.maxStep, event.steps);
        this.recordRunDuration(event.traceId, event.timestamp);
        break;
      default:
        break;
    }
  }

  snapshot(): ProductionMetricsSnapshot {
    const toolSuccessRate =
      this.toolCallCount > 0 ? this.toolSuccessCount / this.toolCallCount : 0;
    const toolErrorRate =
      this.toolCallCount > 0 ? this.toolErrorCount / this.toolCallCount : 0;
    const health = this.createHealthSnapshot(toolErrorRate);

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
        p50LatencyMs: this.getToolLatencyPercentile(50),
        p95LatencyMs: this.getToolLatencyPercentile(95),
        p99LatencyMs: this.getToolLatencyPercentile(99),
        successRate: toolSuccessRate,
        errorRate: toolErrorRate,
        errorsByCode: Object.fromEntries(this.toolErrorsByCode),
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
        completionRate:
          this.startedRuns > 0 ? this.completedRuns / this.startedRuns : 0,
      },
      quality: {
        taskSuccessRate:
          this.startedRuns > 0 ? this.completedRuns / this.startedRuns : 0,
        averageRunDurationMs:
          this.runDurationSamples.length > 0
            ? this.runDurationSamples.reduce((sum, value) => sum + value, 0) /
              this.runDurationSamples.length
            : 0,
        averageTokensPerRun:
          this.startedRuns > 0 ? this.totalTokens / this.startedRuns : 0,
        errorRecoveryRate:
          this.failedToolCallCount > 0
            ? this.recoveredToolCallCount / this.failedToolCallCount
            : 0,
        duplicateToolCallRate:
          this.toolCallCount > 0 ? this.duplicateToolCallCount / this.toolCallCount : 0,
      },
      health: {
        status: health.status,
        alerts: health.alerts,
      },
    };
  }

  private getToolLatencyPercentile(percentile: number): number {
    if (this.toolLatencySamples.length === 0) {
      return 0;
    }

    const sorted = [...this.toolLatencySamples].sort((a, b) => a - b);
    const index = Math.max(
      0,
      Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1),
    );
    return sorted[index];
  }

  private recordRunDuration(traceId: string, completedAt: number): void {
    const startedAt = this.runStartedAtByTraceId.get(traceId);

    if (startedAt === undefined) {
      this.clearTraceState(traceId);
      return;
    }

    this.runDurationSamples.push(Math.max(0, completedAt - startedAt));
    this.clearTraceState(traceId);
  }

  private clearTraceState(traceId: string): void {
    this.runStartedAtByTraceId.delete(traceId);
    this.lastToolNameByTraceId.delete(traceId);
    this.lastToolFailedByTraceId.delete(traceId);
  }

  private createHealthSnapshot(toolErrorRate: number): {
    status: ProductionHealthStatus;
    alerts: ProductionHealthAlert[];
  } {
    const alerts: ProductionHealthAlert[] = [];
    const p99LatencyMs = this.getToolLatencyPercentile(99);

    if (
      this.toolCallCount > 0 &&
      toolErrorRate > this.errorRateWarningThreshold
    ) {
      const criticalThreshold = this.errorRateWarningThreshold * 2;
      const critical = toolErrorRate >= criticalThreshold;
      alerts.push({
        level: critical ? 'critical' : 'warning',
        code: 'tool_error_rate_high',
        message: 'Tool error rate exceeds configured threshold',
        value: toolErrorRate,
        threshold: critical ? criticalThreshold : this.errorRateWarningThreshold,
      });
    }

    if (this.toolCallCount > 0 && p99LatencyMs > this.latencyWarningMs) {
      alerts.push({
        level: 'warning',
        code: 'tool_latency_high',
        message: 'Tool P99 latency exceeds configured threshold',
        value: p99LatencyMs,
        threshold: this.latencyWarningMs,
      });
    }

    if (this.runtimeErrorCount > 0) {
      alerts.push({
        level: 'critical',
        code: 'runtime_errors_present',
        message: 'Runtime errors were observed',
        value: this.runtimeErrorCount,
        threshold: 0,
      });
    }

    const hasCritical = alerts.some((alert) => alert.level === 'critical');

    return {
      status: hasCritical ? 'critical' : alerts.length > 0 ? 'degraded' : 'healthy',
      alerts,
    };
  }
}
