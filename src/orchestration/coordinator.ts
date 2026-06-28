// 该文件实现任务协调器，按依赖关系调度任务、处理重试并汇总执行结果。
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

/** 任务协调器，按依赖图调度任务并根据角色选择对应处理器执行。 */
export class Coordinator {
  private readonly defaultRole: string;
  private readonly maxRetries: number;

  /** 初始化角色处理器、默认角色、最大重试次数和失败后是否继续等选项。 */
  constructor(private readonly options: CoordinatorOptions) {
    this.defaultRole = options.defaultRole ?? 'default';
    this.maxRetries = options.maxRetries ?? 0;
  }

  /** 执行一组任务，持续调度可运行任务直到全部完成、跳过或无法继续。 */
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

  /** 执行单个任务，处理状态流转、重试和失败策略。 */
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

  /** 在允许失败后继续时，将仍处于 pending 的阻塞任务标记为 skipped。 */
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

  /** 根据任务角色查找对应处理器，不存在时抛出配置错误。 */
  private getHandler(task: Task): TaskHandler {
    const role = task.role ?? this.defaultRole;
    const handler = this.options.handlers[role];

    if (!handler) {
      throw new Error(`No handler registered for role: ${role}`);
    }

    return handler;
  }
}
