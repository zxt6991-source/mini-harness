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
