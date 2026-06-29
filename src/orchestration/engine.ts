// 该文件组合 workflow 状态机和 Coordinator，提供工作流级编排事件流。
import { createId } from '../utils/id';
import { Coordinator, type CoordinatorOptions } from './coordinator';
import { createOrchestrationEvent, type OrchestrationEvent } from './events';
import type { Task } from './task';
import type { WorkflowDefinition } from './workflow';
import { WorkflowStateMachine } from './workflow-state-machine';

export interface OrchestrationEngineOptions extends CoordinatorOptions {
  workflow: WorkflowDefinition;
}

export interface OrchestrationEngineRunInput {
  workflowRunId?: string;
  traceId?: string;
  tasks: Task[];
  values?: Record<string, unknown>;
}

const coordinatorTaskEvents = new Set([
  'task_queued',
  'task_start',
  'task_retry',
  'task_result',
  'task_skipped',
  'task_cancelled',
  'checkpoint_saved',
]);

/** 工作流编排引擎。当前实现为单进程内存版。 */
export class OrchestrationEngine {
  private readonly workflow: WorkflowDefinition;
  private readonly coordinatorOptions: CoordinatorOptions;

  /** 注入 workflow definition 和任务执行选项。 */
  constructor(options: OrchestrationEngineOptions) {
    this.workflow = options.workflow;
    this.coordinatorOptions = {
      handlers: options.handlers,
      defaultRole: options.defaultRole,
      maxRetries: options.maxRetries,
      continueOnFailure: options.continueOnFailure,
      maxConcurrentTasks: options.maxConcurrentTasks,
      defaultTaskTimeoutMs: options.defaultTaskTimeoutMs,
    };
  }

  /** 执行 workflow 并逐步产出编排事件。 */
  async *runEvents(
    input: OrchestrationEngineRunInput,
  ): AsyncIterable<OrchestrationEvent> {
    const workflowRunId = input.workflowRunId ?? createId('workflow');
    const traceId = input.traceId ?? createId('trace');
    const machine = new WorkflowStateMachine(this.workflow);
    let tasks = input.tasks;

    machine.initialize(input.values ?? {});

    yield createOrchestrationEvent({
      type: 'workflow_start',
      workflowRunId,
      traceId,
      stateId: machine.currentStateId,
    });

    while (machine.currentStateId) {
      const state = machine.getCurrentState();
      if (!state) {
        break;
      }

      yield createOrchestrationEvent({
        type: 'workflow_state_enter',
        workflowRunId,
        traceId,
        stateId: state.id,
      });

      if (state.taskIds && state.taskIds.length > 0) {
        const stateTaskIds = new Set(state.taskIds);
        const selectedTasks = tasks
          .filter((task) => stateTaskIds.has(task.id))
          .map((task) => ({
            ...task,
            dependsOn: task.dependsOn.filter((dependencyId) =>
              stateTaskIds.has(dependencyId),
            ),
          }));
        const coordinator = new Coordinator(this.coordinatorOptions);
        const { result, events } = await coordinator.runWithEvents(selectedTasks, {
          workflowRunId,
          traceId,
        });
        for (const event of events) {
          if (coordinatorTaskEvents.has(event.type)) {
            yield {
              ...event,
              stateId: state.id,
            };
          }
        }

        const byId = new Map(result.tasks.map((task) => [task.id, task]));
        tasks = tasks.map((task) => byId.get(task.id) ?? task);
      }

      if (machine.isFinal() || machine.isError()) {
        break;
      }

      const currentStateId = state.id;
      const nextStateId = machine.findNextState();
      if (!nextStateId) {
        break;
      }

      yield createOrchestrationEvent({
        type: 'workflow_state_exit',
        workflowRunId,
        traceId,
        stateId: currentStateId,
      });
      machine.transition(nextStateId);
    }

    yield createOrchestrationEvent({
      type: 'workflow_end',
      workflowRunId,
      traceId,
      stateId: machine.currentStateId,
    });
  }
}
