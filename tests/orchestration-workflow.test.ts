import { describe, expect, it } from 'vitest';
import { OrchestrationEngine } from '../src/orchestration/engine';
import type { WorkflowDefinition } from '../src/orchestration/workflow';
import { WorkflowStateMachine } from '../src/orchestration/workflow-state-machine';
import type { Task } from '../src/orchestration/task';

function task(id: string, dependsOn: string[] = []): Task {
  return {
    id,
    title: id,
    description: `${id} description`,
    status: 'pending',
    dependsOn,
  };
}

describe('WorkflowStateMachine', () => {
  it('transitions through conditional workflow states and records history', () => {
    const definition: WorkflowDefinition = {
      id: 'quality_loop',
      name: 'Quality loop',
      version: '1.0.0',
      initialState: 'start',
      states: [
        { id: 'start', type: 'initial' },
        { id: 'evaluate', type: 'normal' },
        { id: 'complete', type: 'final' },
        { id: 'error', type: 'error' },
      ],
      transitions: [
        { from: 'start', to: 'evaluate' },
        {
          from: 'evaluate',
          to: 'complete',
          condition: (ctx) => ctx.values.get('passed') === true,
        },
        {
          from: 'evaluate',
          to: 'error',
          condition: (ctx) => ctx.values.get('passed') !== true,
        },
      ],
    };
    const machine = new WorkflowStateMachine(definition);

    machine.initialize({ passed: true });
    expect(machine.currentStateId).toBe('start');
    expect(machine.transitionToNext()).toBe('evaluate');
    expect(machine.transitionToNext()).toBe('complete');
    expect(machine.isFinal()).toBe(true);
    expect(
      machine.history.map((entry) => `${entry.event}:${entry.stateId}`),
    ).toEqual([
      'state_entry:start',
      'state_exit:start',
      'state_entry:evaluate',
      'state_exit:evaluate',
      'state_entry:complete',
    ]);
  });

  it('rejects workflow definitions without exactly one initial state', () => {
    expect(
      () =>
        new WorkflowStateMachine({
          id: 'invalid',
          name: 'Invalid',
          version: '1.0.0',
          initialState: 'start',
          states: [
            { id: 'start', type: 'initial' },
            { id: 'other', type: 'initial' },
          ],
          transitions: [],
        }),
    ).toThrow('Workflow must define exactly one initial state');
  });
});

describe('OrchestrationEngine', () => {
  it('runs workflow states with bound tasks and emits state lifecycle events', async () => {
    const definition: WorkflowDefinition = {
      id: 'research_flow',
      name: 'Research flow',
      version: '1.0.0',
      initialState: 'start',
      states: [
        { id: 'start', type: 'initial' },
        { id: 'research', type: 'normal', taskIds: ['research'] },
        { id: 'synthesis', type: 'normal', taskIds: ['synthesis'] },
        { id: 'complete', type: 'final' },
      ],
      transitions: [
        { from: 'start', to: 'research' },
        { from: 'research', to: 'synthesis' },
        { from: 'synthesis', to: 'complete' },
      ],
    };
    const engine = new OrchestrationEngine({
      workflow: definition,
      handlers: {
        default: async (currentTask) => ({ result: `${currentTask.id} done` }),
      },
    });
    const events = [];

    for await (const event of engine.runEvents({
      workflowRunId: 'workflow_1',
      tasks: [task('research'), task('synthesis', ['research'])],
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'workflow_start',
      'workflow_state_enter',
      'workflow_state_exit',
      'workflow_state_enter',
      'task_queued',
      'task_start',
      'task_result',
      'checkpoint_saved',
      'workflow_state_exit',
      'workflow_state_enter',
      'task_queued',
      'task_start',
      'task_result',
      'checkpoint_saved',
      'workflow_state_exit',
      'workflow_state_enter',
      'workflow_end',
    ]);
    expect(events.at(-1)).toMatchObject({
      workflowRunId: 'workflow_1',
      stateId: 'complete',
    });
  });
});
