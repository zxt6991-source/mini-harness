import type { Task } from './task';

export class TaskGraph {
  private readonly tasksById = new Map<string, Task>();

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

  getTasks(): Task[] {
    return this.topologicalSort();
  }

  updateTask(task: Task): TaskGraph {
    const nextTasks = this.getTasks().map((current) =>
      current.id === task.id ? task : current,
    );

    return new TaskGraph(nextTasks);
  }

  private validateDependencies(): void {
    for (const task of this.tasksById.values()) {
      for (const dependencyId of task.dependsOn) {
        if (!this.tasksById.has(dependencyId)) {
          throw new Error(`Task ${task.id} depends on missing task ${dependencyId}`);
        }
      }
    }
  }

  private mustGetTask(taskId: string): Task {
    const task = this.tasksById.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return task;
  }
}
