// 该文件定义编排事件协议，用于观察 workflow、task、消息和检查点生命周期。
export type OrchestrationEventType =
  | 'workflow_start'
  | 'workflow_state_enter'
  | 'workflow_state_exit'
  | 'task_queued'
  | 'task_start'
  | 'task_retry'
  | 'task_result'
  | 'task_skipped'
  | 'task_cancelled'
  | 'message_sent'
  | 'checkpoint_saved'
  | 'workflow_end'
  | 'orchestration_error';

export interface OrchestrationSnapshot {
  taskCount?: number;
  completedTaskCount?: number;
  failedTaskCount?: number;
  skippedTaskCount?: number;
  runningTaskCount?: number;
  currentState?: string;
  taskStatuses?: Record<string, string>;
}

export interface OrchestrationEvent {
  type: OrchestrationEventType;
  timestamp: number;
  workflowRunId: string;
  traceId: string;
  taskId?: string;
  stateId?: string;
  attempt?: number;
  snapshot?: OrchestrationSnapshot;
  metadata?: Record<string, unknown>;
}

export type OrchestrationEventInput = Omit<OrchestrationEvent, 'timestamp'> & {
  timestamp?: number;
};

/** 构造带统一 timestamp 的编排事件。 */
export function createOrchestrationEvent(
  event: OrchestrationEventInput,
): OrchestrationEvent {
  return {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  };
}
