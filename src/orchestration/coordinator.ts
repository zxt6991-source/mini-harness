import { TaskGraph } from './graph';
import { TaskStateMachine } from './state-machine';
import type { Task, TaskHandler } from './task';

export interface CoordinatorOptions {
  handlers: Record<string, TaskHandler>;
  defaultRole?: string;
  maxRetries?: number;
  continueOnFailure?: boolean;
}

export interface CoordinationResult {
  tasks: Task[];
}

export class Coordinator {
  private readonly defaultRole: string;
  private readonly maxRetries: number;

  constructor(private readonly options: CoordinatorOptions) {
    this.defaultRole = options.defaultRole ?? 'default';
    this.maxRetries = options.maxRetries ?? 0;
  }

  async run(tasks: Task[]): Promise<CoordinationResult> {
    let graph = new TaskGraph(tasks);

    while (true) {
      const runnable = graph.getRunnableTasks();

      if (runnable.length === 0) {
        const currentTasks = graph.getTasks();
        const pending = currentTasks.filter((task) => task.status === 'pending');

        if (pending.length > 0 && this.options.continueOnFailure) {
          graph = this.skipBlockedTasks(graph);
          continue;
        }

        return { tasks: currentTasks };
      }

      for (const task of runnable) {
        graph = await this.executeTask(graph, task);
      }
    }
  }

  private async executeTask(graph: TaskGraph, task: Task): Promise<TaskGraph> {
    let current = task;
    let attempts = current.attempts ?? 0;

    while (attempts <= this.maxRetries) {
      current = TaskStateMachine.transition(current, 'running', {
        attempts: attempts + 1,
      });
      graph = graph.updateTask(current);

      try {
        const handler = this.getHandler(current);
        const result = await handler(current, {
          task: current,
          completedTasks: graph.getTasks().filter((item) => item.status === 'done'),
        });
        current = TaskStateMachine.transition(current, 'done', {
          result: result.result,
        });

        return graph.updateTask(current);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        current = TaskStateMachine.transition(current, 'failed', {
          error: message,
        });
        graph = graph.updateTask(current);

        attempts++;
        if (attempts > this.maxRetries) {
          if (this.options.continueOnFailure) {
            return graph;
          }

          throw error;
        }
      }
    }

    return graph;
  }

  private skipBlockedTasks(graph: TaskGraph): TaskGraph {
    let nextGraph = graph;
    for (const task of graph.getTasks()) {
      if (task.status === 'pending') {
        nextGraph = nextGraph.updateTask(
          TaskStateMachine.transition(task, 'skipped'),
        );
      }
    }

    return nextGraph;
  }

  private getHandler(task: Task): TaskHandler {
    const role = task.role ?? this.defaultRole;
    const handler = this.options.handlers[role];

    if (!handler) {
      throw new Error(`No handler registered for role: ${role}`);
    }

    return handler;
  }
}
