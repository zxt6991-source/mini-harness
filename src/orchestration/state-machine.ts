import type { Task, TaskStatus } from './task';

const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'skipped'],
  running: ['done', 'failed'],
  done: [],
  failed: ['running', 'skipped'],
  skipped: [],
};

export class TaskStateMachine {
  static transition(
    task: Task,
    nextStatus: TaskStatus,
    patch: Partial<Pick<Task, 'result' | 'error' | 'attempts'>> = {},
  ): Task {
    if (!allowedTransitions[task.status].includes(nextStatus)) {
      throw new Error(`Invalid task transition: ${task.status} -> ${nextStatus}`);
    }

    return {
      ...task,
      ...patch,
      status: nextStatus,
    };
  }
}
