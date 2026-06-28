// 该文件定义运行时状态快照，帮助事件流暴露可观察的执行进度。
import { MiniHarnessError, type Message, type TokenUsage } from '../core';

export type TerminationReason =
  | 'no_tool_calls'
  | 'max_steps_exceeded'
  | 'error'
  | 'aborted'
  | 'drift_detected';

export interface RunState {
  sessionId: string;
  traceId: string;
  startedAt: number;
  step: number;
  messages: Message[];
  modelCallCount: number;
  toolCallCount: number;
  estimatedTokens: number;
  usedTokens: number;
  terminationReason?: TerminationReason;
}

export interface RunSnapshot {
  sessionId: string;
  traceId: string;
  step: number;
  messageCount: number;
  modelCallCount: number;
  toolCallCount: number;
  estimatedTokens: number;
  usedTokens: number;
  elapsedMs: number;
  terminationReason?: TerminationReason;
}

/** 表示运行被外部 AbortSignal 取消。 */
export class RuntimeAbortedError extends MiniHarnessError {
  /** 创建运行时取消错误。 */
  constructor() {
    super('Runtime execution was aborted', 'RUNTIME_ABORTED');
  }
}

/** 创建一次运行的初始状态，记录会话、trace 和首条用户消息。 */
export function createRunState(input: {
  sessionId: string;
  traceId: string;
  userMessage: Message;
}): RunState {
  return {
    sessionId: input.sessionId,
    traceId: input.traceId,
    startedAt: Date.now(),
    step: 0,
    messages: [input.userMessage],
    modelCallCount: 0,
    toolCallCount: 0,
    estimatedTokens: 0,
    usedTokens: 0,
  };
}

/** 将运行时状态转换成可安全暴露给事件消费者的摘要。 */
export function snapshotRunState(state: RunState): RunSnapshot {
  return {
    sessionId: state.sessionId,
    traceId: state.traceId,
    step: state.step,
    messageCount: state.messages.length,
    modelCallCount: state.modelCallCount,
    toolCallCount: state.toolCallCount,
    estimatedTokens: state.estimatedTokens,
    usedTokens: state.usedTokens,
    elapsedMs: Date.now() - state.startedAt,
    terminationReason: state.terminationReason,
  };
}

/** 把模型返回的 token 用量累加到运行状态。 */
export function recordTokenUsage(state: RunState, usage: TokenUsage | undefined): void {
  if (!usage) {
    return;
  }

  state.usedTokens += usage.totalTokens;
}
