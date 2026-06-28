// 该文件定义任务状态机，集中校验任务状态流转是否合法。
import type { Task, TaskStatus } from './task';

const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'skipped'],
  running: ['done', 'failed'],
  done: [],
  failed: ['running', 'skipped'],
  skipped: [],
};

/** 任务状态机，集中定义并校验任务状态之间的合法转换。 */
export class TaskStateMachine {
  /** 将任务转换到下一个状态，并合并结果、错误或尝试次数等补丁字段。 */
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
