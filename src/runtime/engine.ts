// 该文件实现 Agent 主循环，负责串联模型、记忆和工具调用直到生成最终回复。
import type {
  Memory,
  MemoryLifecycle,
  MemoryRunEndEvent,
  Message,
  ModelChatOutput,
  ModelProvider,
  ToolRegistry,
} from '../core';
import { MaxStepsExceededError } from '../core';
import {
  createGovernanceObservation,
  type ModelOutputGovernance,
} from '../models/output-governance';
import { createId } from '../utils/id';
import { BudgetManager, type RuntimeBudget } from './budget';
import { DriftGuard, type DriftGuardOptions } from './drift';
import { createEngineEvent, type EngineEvent } from './events';
import {
  getRetryDelayMs,
  isRetryableError,
  resolveRetryPolicy,
  sleep,
  type RetryPolicyOptions,
} from './retry';
import {
  createRunState,
  recordTokenUsage,
  RuntimeAbortedError,
  snapshotRunState,
  type RunState,
} from './state';
import { ToolScheduler, type ToolErrorMode } from './tool-scheduler';

export interface EngineOptions {
  maxSteps: number;
  requestTimeoutMs: number;
  enableStream: boolean;
  maxConcurrentTools?: number;
  toolErrorMode?: ToolErrorMode;
  toolTimeoutMs?: number;
  modelRetry?: RetryPolicyOptions;
  budget?: Partial<RuntimeBudget>;
  drift?: DriftGuardOptions;
  outputGovernance?: ModelOutputGovernance;
  metrics?: RuntimeMetricsSink;
}

export interface EngineRunOptions {
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface RuntimeMetricsSink {
  record(event: EngineEvent): void;
}

type EngineEventInput = Parameters<typeof createEngineEvent>[0];

/** 把用户输入文本包装成内部统一的 user 消息对象。 */
function createUserMessage(input: string): Message {
  return {
    id: createId('msg'),
    role: 'user',
    content: input,
    createdAt: Date.now(),
  };
}

/** 从未知错误中提取可读消息。 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 从错误对象中提取框架错误码。 */
function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

/** 从错误对象中提取是否可重试的标记。 */
function getRetryable(error: unknown): boolean | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    typeof error.retryable === 'boolean'
    ? error.retryable
    : undefined;
}

function hasMemoryLifecycle(memory: Memory): memory is Memory & MemoryLifecycle {
  return (
    'onRunEnd' in memory &&
    typeof (memory as { onRunEnd?: unknown }).onRunEnd === 'function'
  );
}

async function notifyMemoryRunEnd(
  memory: Memory,
  event: MemoryRunEndEvent,
): Promise<void> {
  if (hasMemoryLifecycle(memory)) {
    await memory.onRunEnd(event);
  }
}

/** Agent 运行时引擎，负责驱动模型回复、工具调用和记忆写入的完整循环。 */
export class Engine {
  /** 注入模型、记忆、工具注册表和运行选项，创建一个可执行的引擎实例。 */
  constructor(
    private readonly model: ModelProvider,
    private readonly memory: Memory,
    private readonly tools: ToolRegistry,
    private readonly options: EngineOptions,
  ) {}

  /** 执行一次用户输入，持续处理模型工具调用，直到返回最终 assistant 消息。 */
  async run(input: string, sessionId: string): Promise<Message> {
    let finalMessage: Message | undefined;

    for await (const event of this.runEvents(input, sessionId)) {
      if (event.type === 'agent_end') {
        finalMessage = event.message;
      }
    }

    if (!finalMessage) {
      throw new Error('Engine finished without an assistant message');
    }

    return finalMessage;
  }

  /** 执行一次用户输入并逐步产出运行时事件，供 UI、日志或控制面观察。 */
  async *runEvents(
    input: string,
    sessionId: string,
    runOptions: EngineRunOptions = {},
  ): AsyncIterable<EngineEvent> {
    const userMessage = createUserMessage(input);
    const state = createRunState({
      sessionId,
      traceId: userMessage.id,
      userMessage,
    });

    await this.memory.save(sessionId, userMessage);

    const messages = await this.memory.buildContext(sessionId, userMessage);
    const budgetManager = new BudgetManager(this.options.budget);
    const retryPolicy = resolveRetryPolicy(this.options.modelRetry);
    const driftGuard = new DriftGuard(this.options.drift);
    const emit = (event: EngineEventInput): EngineEvent => {
      const created = createEngineEvent(event);
      this.options.metrics?.record(created);
      return created;
    };

    yield emit({
      type: 'agent_start',
      sessionId,
      traceId: state.traceId,
      inputLength: input.length,
      snapshot: snapshotRunState(state),
      metadata: runOptions.metadata,
    });

    for (let step = 0; step < this.options.maxSteps; step++) {
      state.step = step;

      yield emit({
        type: 'turn_start',
        sessionId,
        traceId: state.traceId,
        step,
        snapshot: snapshotRunState(state),
      });

      if (runOptions.abortSignal?.aborted) {
        state.terminationReason = 'aborted';
        const error = new RuntimeAbortedError();
        yield emit({
          type: 'runtime_error',
          sessionId,
          traceId: state.traceId,
          phase: 'abort',
          errorCode: error.code,
          retryable: false,
          message: error.message,
          snapshot: snapshotRunState(state),
        });
        throw error;
      }

      yield emit({
        type: 'model_start',
        sessionId,
        traceId: state.traceId,
        provider: this.model.name,
        timeoutMs: this.options.requestTimeoutMs,
        snapshot: snapshotRunState(state),
      });

      let output: ModelChatOutput;
      for (let attempt = 1; ; attempt++) {
        try {
          const budgetCheck = budgetManager.checkBeforeModelCall({
            messages,
            modelCallCount: state.modelCallCount,
            usedTokens: state.usedTokens,
          });
          state.estimatedTokens = budgetCheck.estimatedTokens;

          output = await this.model.chat({
            messages,
            tools: this.tools.list(),
            options: {
              timeoutMs: this.options.requestTimeoutMs,
            },
            metadata: {
              traceId: userMessage.id,
              sessionId,
              ...runOptions.metadata,
            },
          });
          state.modelCallCount++;
          break;
        } catch (error) {
          if (getErrorCode(error) === 'RUNTIME_BUDGET_EXCEEDED') {
            state.terminationReason = 'error';
            yield emit({
              type: 'runtime_error',
              sessionId,
              traceId: state.traceId,
              phase: 'budget',
              errorCode: getErrorCode(error),
              retryable: false,
              message: getErrorMessage(error),
              snapshot: snapshotRunState(state),
            });
            throw error;
          }

          state.modelCallCount++;
          const willRetry =
            isRetryableError(error) && attempt <= retryPolicy.maxRetries;
          yield emit({
            type: 'runtime_error',
            sessionId,
            traceId: state.traceId,
            phase: 'model',
            errorCode: getErrorCode(error),
            retryable: getRetryable(error),
            message: getErrorMessage(error),
            snapshot: snapshotRunState(state),
            metadata: {
              attempt,
              willRetry,
            },
          });

          if (!willRetry) {
            state.terminationReason = 'error';
            throw error;
          }

          await sleep(getRetryDelayMs(attempt, retryPolicy));
        }
      }

      budgetManager.recordUsage(output.usage);
      recordTokenUsage(state, output.usage);

      const assistantMessage = output.message;
      const originalToolCalls = assistantMessage.toolCalls ?? [];
      let executableToolCalls = originalToolCalls;

      yield emit({
        type: 'model_message',
        sessionId,
        traceId: state.traceId,
        message: assistantMessage,
        usage: output.usage,
        snapshot: snapshotRunState(state),
      });

      if (runOptions.abortSignal?.aborted) {
        state.terminationReason = 'aborted';
        const error = new RuntimeAbortedError();
        yield emit({
          type: 'runtime_error',
          sessionId,
          traceId: state.traceId,
          phase: 'abort',
          errorCode: error.code,
          retryable: false,
          message: error.message,
          snapshot: snapshotRunState(state),
        });
        throw error;
      }

      const governanceReport =
        this.options.outputGovernance?.validateAssistantMessage(assistantMessage);

      if (governanceReport) {
        yield emit({
          type: 'output_governance',
          sessionId,
          traceId: state.traceId,
          passed: governanceReport.passed,
          acceptedToolCallCount: governanceReport.acceptedToolCalls.length,
          rejectedToolCallCount: governanceReport.rejectedToolCalls.length,
          snapshot: snapshotRunState(state),
          metadata: {
            rejectedToolCalls: governanceReport.rejectedToolCalls,
          },
        });

        executableToolCalls = governanceReport.acceptedToolCalls;

        if (!governanceReport.passed && this.options.outputGovernance?.mode === 'throw') {
          const first = governanceReport.rejectedToolCalls[0];
          state.terminationReason = 'error';
          yield emit({
            type: 'runtime_error',
            sessionId,
            traceId: state.traceId,
            phase: 'output_governance',
            errorCode: first?.code,
            retryable: false,
            message: first?.message ?? 'Model output governance failed',
            snapshot: snapshotRunState(state),
          });
          throw new Error(first?.message ?? 'Model output governance failed');
        }
      }

      if (originalToolCalls.length === 0) {
        await this.memory.save(sessionId, assistantMessage);
        state.messages.push(assistantMessage);
        state.terminationReason = 'no_tool_calls';

        await notifyMemoryRunEnd(this.memory, {
          sessionId,
          traceId: state.traceId,
          userMessage,
          finalMessage: assistantMessage,
          terminationReason: state.terminationReason,
          snapshot: snapshotRunState(state) as unknown as Record<string, unknown>,
        });

        yield emit({
          type: 'agent_end',
          sessionId,
          traceId: state.traceId,
          message: assistantMessage,
          steps: step + 1,
          usage: output.usage,
          snapshot: snapshotRunState(state),
        });
        return;
      }

      messages.push(assistantMessage);
      await this.memory.save(sessionId, assistantMessage);
      state.messages.push(assistantMessage);

      if (
        governanceReport &&
        !governanceReport.passed &&
        this.options.outputGovernance?.mode === 'observe'
      ) {
        for (const rejection of governanceReport.rejectedToolCalls) {
          const correctionMessage = createGovernanceObservation(rejection);
          messages.push(correctionMessage);
          await this.memory.save(sessionId, correctionMessage);
          state.messages.push(correctionMessage);

          yield emit({
            type: 'model_correction',
            sessionId,
            traceId: state.traceId,
            toolCallId: rejection.toolCallId,
            toolName: rejection.toolName,
            message: correctionMessage.content,
            snapshot: snapshotRunState(state),
          });
        }

        if (executableToolCalls.length === 0) {
          state.step = step + 1;
          yield emit({
            type: 'turn_end',
            sessionId,
            traceId: state.traceId,
            step,
            toolCallCount: 0,
            snapshot: snapshotRunState(state),
          });
          continue;
        }
      }

      if (runOptions.abortSignal?.aborted) {
        state.terminationReason = 'aborted';
        const error = new RuntimeAbortedError();
        yield emit({
          type: 'runtime_error',
          sessionId,
          traceId: state.traceId,
          phase: 'abort',
          errorCode: error.code,
          retryable: false,
          message: error.message,
          snapshot: snapshotRunState(state),
        });
        throw error;
      }

      for (const toolCall of executableToolCalls) {
        yield emit({
          type: 'tool_start',
          sessionId,
          traceId: state.traceId,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          snapshot: snapshotRunState(state),
        });
      }

      let toolResults;
      try {
        const scheduler = new ToolScheduler(this.tools, {
          maxConcurrentTools: this.options.maxConcurrentTools,
          toolErrorMode: this.options.toolErrorMode,
          toolTimeoutMs: this.options.toolTimeoutMs,
        });
        toolResults = await scheduler.executeAll(executableToolCalls, {
          traceId: assistantMessage.id,
          sessionId,
          abortSignal: runOptions.abortSignal,
        });
      } catch (error) {
        state.terminationReason = 'error';
        yield emit({
          type: 'runtime_error',
          sessionId,
          traceId: state.traceId,
          phase: 'tool',
          errorCode: getErrorCode(error),
          retryable: getRetryable(error),
          message: getErrorMessage(error),
          snapshot: snapshotRunState(state),
        });
        throw error;
      }

      for (const result of toolResults) {
        const { toolCall, message: resultMessage } = result;

        state.toolCallCount++;
        messages.push(resultMessage);
        await this.memory.save(sessionId, resultMessage);
        state.messages.push(resultMessage);

        yield emit({
          type: 'tool_result',
          sessionId,
          traceId: state.traceId,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          success: resultMessage.metadata?.success === true,
          latencyMs: result.latencyMs,
          snapshot: snapshotRunState(state),
        });
      }

      try {
        driftGuard.recordToolCalls(executableToolCalls);
      } catch (error) {
        state.terminationReason = 'drift_detected';
        yield emit({
          type: 'runtime_error',
          sessionId,
          traceId: state.traceId,
          phase: 'drift',
          errorCode: getErrorCode(error),
          retryable: false,
          message: getErrorMessage(error),
          snapshot: snapshotRunState(state),
        });
        throw error;
      }

      state.step = step + 1;
      yield emit({
        type: 'turn_end',
        sessionId,
        traceId: state.traceId,
        step,
        toolCallCount: executableToolCalls.length,
        snapshot: snapshotRunState(state),
      });
    }

    state.terminationReason = 'max_steps_exceeded';
    yield emit({
      type: 'runtime_error',
      sessionId,
      traceId: state.traceId,
      phase: 'termination',
      errorCode: 'MAX_STEPS_EXCEEDED',
      retryable: false,
      message: `Agent loop exceeded maxSteps=${this.options.maxSteps}`,
      snapshot: snapshotRunState(state),
    });
    throw new MaxStepsExceededError(this.options.maxSteps);
  }
}
