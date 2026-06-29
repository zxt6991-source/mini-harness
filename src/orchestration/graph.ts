// 该文件实现任务依赖图，负责校验依赖、拓扑排序并找出当前可运行任务。
import type { Task } from './task';

/** 任务依赖图，封装任务唯一性、依赖校验、排序和更新逻辑。 */
export class TaskGraph {
  private readonly tasksById = new Map<string, Task>();

  /** 根据任务列表创建依赖图，并立即校验重复 ID、缺失依赖和循环依赖。 */
  constructor(tasks: Task[]) {
    for (const task of tasks) {
      if (this.tasksById.has(task.id)) {
        throw new Error(`Duplicate task id: ${task.id}`);
      }

      this.tasksById.set(task.id, task);
    }

    this.validateDependencies();
    this.topologicalSort();
  }

  /** 对任务图进行拓扑排序，确保依赖任务排在依赖它的任务之前。 */
  topologicalSort(): Task[] {
    const permanent = new Set<string>();
    const temporary = new Set<string>();
    const sorted: Task[] = [];

    const visit = (task: Task) => {
      if (permanent.has(task.id)) {
        return;
      }

      if (temporary.has(task.id)) {
        throw new Error('Task graph contains a cycle');
      }

      temporary.add(task.id);

      for (const dependencyId of task.dependsOn) {
        visit(this.mustGetTask(dependencyId));
      }

      temporary.delete(task.id);
      permanent.add(task.id);
      sorted.push(task);
    };

    for (const task of this.tasksById.values()) {
      visit(task);
    }

    return sorted;
  }

  /** 返回当前状态为 pending 且所有依赖已完成的任务。 */
  getRunnableTasks(): Task[] {
    return this.topologicalSort().filter((task) => {
      if (task.status !== 'pending') {
        return false;
      }

      return task.dependsOn.every(
        (dependencyId) => this.mustGetTask(dependencyId).status === 'done',
      );
    });
  }

  /** 返回按依赖顺序排列的全部任务。 */
  getTasks(): Task[] {
    return this.topologicalSort();
  }

  /** 返回按依赖层分组的可并行任务集合。 */
  getParallelizableGroups(): Task[][] {
    const ordered = this.topologicalSort();
    const remaining = new Set(ordered.map((task) => task.id));
    const completed = new Set<string>();
    const groups: Task[][] = [];

    while (remaining.size > 0) {
      const ready = ordered.filter(
        (task) =>
          remaining.has(task.id) &&
          task.dependsOn.every((dependencyId) => completed.has(dependencyId)),
      );

      if (ready.length === 0) {
        throw new Error('Task graph contains a cycle');
      }

      groups.push(ready);
      for (const task of ready) {
        remaining.delete(task.id);
        completed.add(task.id);
      }
    }

    return groups;
  }

  /** 返回直接或间接依赖指定任务的所有后代任务，按拓扑顺序排列。 */
  getBlockedDescendants(taskId: string): Task[] {
    this.mustGetTask(taskId);
    const blocked = new Set<string>();
    let changed = true;

    while (changed) {
      changed = false;
      for (const task of this.topologicalSort()) {
        if (task.id === taskId || blocked.has(task.id)) {
          continue;
        }

        if (
          task.dependsOn.includes(taskId) ||
          task.dependsOn.some((dependencyId) => blocked.has(dependencyId))
        ) {
          blocked.add(task.id);
          changed = true;
        }
      }
    }

    return this.topologicalSort().filter((task) => blocked.has(task.id));
  }

  /** 返回直接或间接依赖指定任务的所有后代任务。 */
  getDependents(taskId: string): Task[] {
    return this.getBlockedDescendants(taskId);
  }

  /** 用新的任务状态替换同 ID 任务，并返回新的不可变任务图实例。 */
  updateTask(task: Task): TaskGraph {
    const nextTasks = this.getTasks().map((current) =>
      current.id === task.id ? task : current,
    );

    return new TaskGraph(nextTasks);
  }

  /** 校验每个任务声明的依赖 ID 都能在当前图中找到。 */
  private validateDependencies(): void {
    for (const task of this.tasksById.values()) {
      for (const dependencyId of task.dependsOn) {
        if (!this.tasksById.has(dependencyId)) {
          throw new Error(`Task ${task.id} depends on missing task ${dependencyId}`);
        }
      }
    }
  }

  /** 获取指定任务；如果任务不存在则抛出错误，避免后续逻辑处理 undefined。 */
  private mustGetTask(taskId: string): Task {
    const task = this.tasksById.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return task;
  }
}
