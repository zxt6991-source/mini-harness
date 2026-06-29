// 该文件实现任务协调器，按依赖关系调度任务、处理重试并汇总执行结果。
import { createId } from '../utils/id';
import { createOrchestrationEvent, type OrchestrationEvent } from './events';
import { TaskGraph } from './graph';
import { TaskStateMachine } from './state-machine';
import type { Task, TaskHandler } from './task';

export interface CoordinatorOptions {
  handlers: Record<string, TaskHandler>;
  defaultRole?: string;
  maxRetries?: number;
  continueOnFailure?: boolean;
  maxConcurrentTasks?: number;
  defaultTaskTimeoutMs?: number;
}

export interface CoordinationResult {
  tasks: Task[];
}

export interface CoordinatorRunEventsOptions {
  workflowRunId?: string;
  traceId?: string;
}

/** 任务协调器，按依赖图调度任务并根据角色选择对应处理器执行。 */
export class Coordinator {
  private readonly defaultRole: string;
  private readonly maxRetries: number;
  private readonly maxConcurrentTasks: number;

  /** 初始化角色处理器、默认角色、最大重试次数和失败后是否继续等选项。 */
  constructor(private readonly options: CoordinatorOptions) {
    this.defaultRole = options.defaultRole ?? 'default';
    this.maxRetries = options.maxRetries ?? 0;
    this.maxConcurrentTasks = Math.max(1, options.maxConcurrentTasks ?? 1);
  }

  /** 执行一组任务，持续调度可运行任务直到全部完成、跳过或无法继续。 */
  async run(tasks: Task[]): Promise<CoordinationResult> {
    return this.runInternal(tasks);
  }

  /** 执行任务并产出编排事件。当前实现先收集事件，再按稳定顺序输出。 */
  async *runEvents(
    tasks: Task[],
    runOptions: CoordinatorRunEventsOptions = {},
  ): AsyncIterable<OrchestrationEvent> {
    const { events } = await this.runWithEvents(tasks, runOptions);

    for (const event of events) {
      yield event;
    }
  }

  /** 执行任务并返回结果与事件，供上层 workflow 组合使用。 */
  async runWithEvents(
    tasks: Task[],
    runOptions: CoordinatorRunEventsOptions = {},
  ): Promise<{ result: CoordinationResult; events: OrchestrationEvent[] }> {
    const events: OrchestrationEvent[] = [];
    const result = await this.runInternal(tasks, {
      workflowRunId: runOptions.workflowRunId ?? createId('workflow'),
      traceId: runOptions.traceId ?? createId('trace'),
      emit: (event) => events.push(event),
    });

    return { result, events };
  }

  private async runInternal(
    tasks: Task[],
    eventSink?: {
      workflowRunId: string;
      traceId: string;
      emit: (event: OrchestrationEvent) => void;
    },
  ): Promise<CoordinationResult> {
    let graph = new TaskGraph(tasks);

    eventSink?.emit(
      createOrchestrationEvent({
        type: 'workflow_start',
        workflowRunId: eventSink.workflowRunId,
        traceId: eventSink.traceId,
        snapshot: this.createSnapshot(graph),
      }),
    );

    while (true) {
      const runnable = graph.getRunnableTasks();

      if (runnable.length === 0) {
        const currentTasks = graph.getTasks();
        const pending = currentTasks.filter((task) => task.status === 'pending');

        if (pending.length > 0 && this.options.continueOnFailure) {
          const nextGraph = this.skipBlockedTasks(graph, eventSink);
          if (nextGraph.getTasks().some((task, index) => task !== graph.getTasks()[index])) {
            graph = nextGraph;
            continue;
          }
        }

        eventSink?.emit(
          createOrchestrationEvent({
            type: 'workflow_end',
            workflowRunId: eventSink.workflowRunId,
            traceId: eventSink.traceId,
            snapshot: this.createSnapshot(graph),
          }),
        );
        return { tasks: currentTasks };
      }

      graph = await this.executeRunnableTasks(graph, runnable, eventSink);
    }
  }

  /** 使用受限并发执行当前 ready tasks，并把结果稳定合并回 TaskGraph。 */
  private async executeRunnableTasks(
    graph: TaskGraph,
    runnable: Task[],
    eventSink:
      | {
          workflowRunId: string;
          traceId: string;
          emit: (event: OrchestrationEvent) => void;
        }
      | undefined,
  ): Promise<TaskGraph> {
    const results = new Map<string, Task>();
    let nextIndex = 0;
    const workerCount = Math.min(this.maxConcurrentTasks, runnable.length);

    const runWorker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex++;
        if (index >= runnable.length) {
          return;
        }

        const task = runnable[index];
        eventSink?.emit(
          createOrchestrationEvent({
            type: 'task_queued',
            workflowRunId: eventSink.workflowRunId,
            traceId: eventSink.traceId,
            taskId: task.id,
            snapshot: this.createSnapshot(graph),
          }),
        );
        results.set(task.id, await this.executeTask(graph, task, eventSink));
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    let nextGraph = graph;
    for (const task of graph.getTasks()) {
      const result = results.get(task.id);
      if (result) {
        nextGraph = nextGraph.updateTask(result);
      }
    }

    return nextGraph;
  }

  /** 执行单个任务，处理状态流转、重试和失败策略。 */
  private async executeTask(
    graph: TaskGraph,
    task: Task,
    eventSink:
      | {
          workflowRunId: string;
          traceId: string;
          emit: (event: OrchestrationEvent) => void;
        }
      | undefined,
  ): Promise<Task> {
    let current = task;
    let attempts = current.attempts ?? 0;

    while (attempts <= this.maxRetries) {
      current = TaskStateMachine.transition(current, 'running', {
        attempts: attempts + 1,
      });
      eventSink?.emit(
        createOrchestrationEvent({
          type: attempts === 0 ? 'task_start' : 'task_retry',
          workflowRunId: eventSink.workflowRunId,
          traceId: eventSink.traceId,
          taskId: current.id,
          attempt: attempts + 1,
          snapshot: this.createSnapshot(graph.updateTask(current)),
        }),
      );

      try {
        const handler = this.getHandler(current);
        const result = await handler(current, {
          task: current,
          completedTasks: graph.getTasks().filter((item) => item.status === 'done'),
        });
        current = TaskStateMachine.transition(current, 'done', {
          result: result.result,
        });

        eventSink?.emit(
          createOrchestrationEvent({
            type: 'task_result',
            workflowRunId: eventSink.workflowRunId,
            traceId: eventSink.traceId,
            taskId: current.id,
            attempt: attempts + 1,
            metadata: {
              status: 'done',
            },
            snapshot: this.createSnapshot(graph.updateTask(current)),
          }),
        );
        eventSink?.emit(
          createOrchestrationEvent({
            type: 'checkpoint_saved',
            workflowRunId: eventSink.workflowRunId,
            traceId: eventSink.traceId,
            taskId: current.id,
            snapshot: this.createSnapshot(graph.updateTask(current)),
          }),
        );
        return current;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        current = TaskStateMachine.transition(current, 'failed', {
          error: message,
        });

        attempts++;
        if (attempts > this.maxRetries) {
          eventSink?.emit(
            createOrchestrationEvent({
              type: 'task_result',
              workflowRunId: eventSink.workflowRunId,
              traceId: eventSink.traceId,
              taskId: current.id,
              attempt: attempts,
              metadata: {
                status: 'failed',
                error: message,
              },
              snapshot: this.createSnapshot(graph.updateTask(current)),
            }),
          );
          if (this.options.continueOnFailure) {
            return current;
          }

          throw error;
        }
      }
    }

    return current;
  }

  /** 在允许失败后继续时，将仍处于 pending 的阻塞任务标记为 skipped。 */
  private skipBlockedTasks(
    graph: TaskGraph,
    eventSink:
      | {
          workflowRunId: string;
          traceId: string;
          emit: (event: OrchestrationEvent) => void;
        }
      | undefined,
  ): TaskGraph {
    let nextGraph = graph;
    const blockedIds = new Set<string>();

    for (const failed of graph.getTasks().filter((task) => task.status === 'failed')) {
      for (const blocked of graph.getBlockedDescendants(failed.id)) {
        blockedIds.add(blocked.id);
      }
    }

    for (const task of graph.getTasks()) {
      if (task.status === 'pending' && blockedIds.has(task.id)) {
        const skipped = TaskStateMachine.transition(task, 'skipped');
        nextGraph = nextGraph.updateTask(
          skipped,
        );
        eventSink?.emit(
          createOrchestrationEvent({
            type: 'task_skipped',
            workflowRunId: eventSink.workflowRunId,
            traceId: eventSink.traceId,
            taskId: skipped.id,
            metadata: {
              reason: 'BLOCKED_BY_FAILED_DEPENDENCY',
            },
            snapshot: this.createSnapshot(nextGraph),
          }),
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

  private createSnapshot(graph: TaskGraph) {
    const tasks = graph.getTasks();
    return {
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((task) => task.status === 'done').length,
      failedTaskCount: tasks.filter((task) => task.status === 'failed').length,
      skippedTaskCount: tasks.filter((task) => task.status === 'skipped').length,
      runningTaskCount: tasks.filter((task) => task.status === 'running').length,
      taskStatuses: Object.fromEntries(tasks.map((task) => [task.id, task.status])),
    };
  }
}
