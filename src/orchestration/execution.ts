// 该文件定义编排 v2 的任务规格和执行记录，并提供与旧 Task 类型的兼容转换。
import { createId } from '../utils/id';
import type { OrchestrationMessage } from './message-bus';
import type { Task, TaskStatus } from './task';

export type TaskType =
  | 'role_handler'
  | 'runtime_agent'
  | 'tool'
  | 'workflow'
  | 'noop';

export type TaskExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled'
  | 'timed_out';

export interface TaskSpec {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  dependsOn: string[];
  role?: string;
  priority?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  continueOnFailure?: boolean;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TaskExecutionResult {
  output?: string;
  data?: Record<string, unknown>;
  messages?: OrchestrationMessage[];
}

export interface TaskExecutionError {
  code: string;
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export interface TaskExecutionMetrics {
  latencyMs: number;
  modelCalls?: number;
  toolCalls?: number;
  tokensUsed?: number;
}

export interface TaskExecution {
  taskId: string;
  runId: string;
  status: TaskExecutionStatus;
  attempt: number;
  startedAt?: number;
  finishedAt?: number;
  result?: TaskExecutionResult;
  error?: TaskExecutionError;
  metrics?: TaskExecutionMetrics;
}

export interface CreateTaskExecutionOptions {
  runId?: string;
  status?: TaskExecutionStatus;
}

function isTaskSpec(task: Task | TaskSpec): task is TaskSpec {
  return 'type' in task;
}

/** 将旧 Task 或新 TaskSpec 归一化为 v2 task spec。 */
export function normalizeTaskSpec(task: Task | TaskSpec): TaskSpec {
  if (isTaskSpec(task)) {
    return {
      ...task,
      dependsOn: [...task.dependsOn],
      type: task.type ?? 'role_handler',
    };
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    type: 'role_handler',
    dependsOn: [...task.dependsOn],
    role: task.role,
  };
}

/** 为 task spec 创建一次独立执行记录。 */
export function createTaskExecution(
  spec: TaskSpec,
  options: CreateTaskExecutionOptions = {},
): TaskExecution {
  return {
    taskId: spec.id,
    runId: options.runId ?? createId('workflow'),
    status: options.status ?? 'pending',
    attempt: 0,
  };
}

/** 把未知错误归一化成可审计的任务执行错误。 */
export function normalizeTaskExecutionError(
  error: unknown,
  code = 'TASK_EXECUTION_ERROR',
): TaskExecutionError {
  const message = error instanceof Error ? error.message : String(error);
  const retryable =
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    error.retryable === true;

  return {
    code,
    message,
    retryable,
    cause: error,
  };
}

function toLegacyStatus(status: TaskExecutionStatus): TaskStatus {
  if (status === 'completed') {
    return 'done';
  }

  if (status === 'failed' || status === 'timed_out' || status === 'cancelled') {
    return 'failed';
  }

  if (status === 'skipped') {
    return 'skipped';
  }

  if (status === 'running' || status === 'queued') {
    return 'running';
  }

  return 'pending';
}

/** 将 v2 spec + execution 投影回旧 Task 形状，兼容现有 API。 */
export function toLegacyTask(spec: TaskSpec, execution: TaskExecution): Task {
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    dependsOn: [...spec.dependsOn],
    role: spec.role,
    status: toLegacyStatus(execution.status),
    attempts: execution.attempt,
    result: execution.result?.output,
    error: execution.error?.message,
  };
}

