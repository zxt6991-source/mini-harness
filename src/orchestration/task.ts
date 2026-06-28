// 该文件定义任务编排的基础类型，包括任务状态、任务结构和任务处理器签名。
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dependsOn: string[];
  role?: string;
  result?: string;
  error?: string;
  attempts?: number;
}

export interface TaskExecutionContext {
  task: Task;
  completedTasks: Task[];
}

export interface TaskExecutionResult {
  result?: string;
}

export type TaskHandler = (
  task: Task,
  context: TaskExecutionContext,
) => Promise<TaskExecutionResult>;
