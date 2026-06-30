// 该文件定义运行时事件协议，用于观察 Agent 循环、模型调用和工具执行过程。
import type { Message, TokenUsage } from '../core';
import type { RunSnapshot } from './state';

export type EngineEventType =
  | 'agent_start'
  | 'turn_start'
  | 'model_start'
  | 'model_delta'
  | 'model_message'
  | 'output_governance'
  | 'model_correction'
  | 'tool_start'
  | 'tool_result'
  | 'turn_end'
  | 'agent_end'
  | 'runtime_error';

interface BaseEngineEvent {
  type: EngineEventType;
  timestamp: number;
  sessionId: string;
  traceId: string;
  snapshot: RunSnapshot;
  metadata?: Record<string, unknown>;
}

export interface AgentStartEvent extends BaseEngineEvent {
  type: 'agent_start';
  inputLength: number;
}

export interface TurnStartEvent extends BaseEngineEvent {
  type: 'turn_start';
  step: number;
}

export interface ModelStartEvent extends BaseEngineEvent {
  type: 'model_start';
  provider: string;
  timeoutMs: number;
}

export interface ModelDeltaEvent extends BaseEngineEvent {
  type: 'model_delta';
  content?: string;
}

export interface ModelMessageEvent extends BaseEngineEvent {
  type: 'model_message';
  message: Message;
  usage?: TokenUsage;
}

export interface OutputGovernanceEvent extends BaseEngineEvent {
  type: 'output_governance';
  passed: boolean;
  acceptedToolCallCount: number;
  rejectedToolCallCount: number;
}

export interface ModelCorrectionEvent extends BaseEngineEvent {
  type: 'model_correction';
  toolCallId: string;
  toolName: string;
  message: string;
}

export interface ToolStartEvent extends BaseEngineEvent {
  type: 'tool_start';
  toolCallId: string;
  toolName: string;
}

export interface ToolResultEvent extends BaseEngineEvent {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  success: boolean;
  latencyMs: number;
  errorCode?: string;
  errorName?: string;
  retryable?: boolean;
}

export interface TurnEndEvent extends BaseEngineEvent {
  type: 'turn_end';
  step: number;
  toolCallCount: number;
}

export interface AgentEndEvent extends BaseEngineEvent {
  type: 'agent_end';
  message: Message;
  steps: number;
  usage?: TokenUsage;
}

export interface RuntimeErrorEvent extends BaseEngineEvent {
  type: 'runtime_error';
  phase: string;
  errorCode?: string;
  retryable?: boolean;
  message: string;
}

export type EngineEvent =
  | AgentStartEvent
  | TurnStartEvent
  | ModelStartEvent
  | ModelDeltaEvent
  | ModelMessageEvent
  | OutputGovernanceEvent
  | ModelCorrectionEvent
  | ToolStartEvent
  | ToolResultEvent
  | TurnEndEvent
  | AgentEndEvent
  | RuntimeErrorEvent;

type EngineEventInput = EngineEvent extends infer Event
  ? Event extends EngineEvent
    ? Omit<Event, 'timestamp'>
    : never
  : never;

/** 构造带通用字段的运行时事件。 */
export function createEngineEvent(event: EngineEventInput): EngineEvent {
  return {
    ...event,
    timestamp: Date.now(),
  } as EngineEvent;
}
