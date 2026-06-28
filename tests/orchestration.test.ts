import { describe, expect, it, vi } from 'vitest';
import { Coordinator } from '../src/orchestration/coordinator';
import { evaluateOutput } from '../src/orchestration/evaluator';
import { TaskGraph } from '../src/orchestration/graph';
import { SimplePlanner } from '../src/orchestration/planner';
import { TaskStateMachine } from '../src/orchestration/state-machine';
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

describe('TaskStateMachine', () => {
  it('allows documented task transitions', () => {
    expect(TaskStateMachine.transition(task('a'), 'running')).toMatchObject({
      status: 'running',
    });
    expect(
      TaskStateMachine.transition({ ...task('a'), status: 'running' }, 'done', {
        result: 'ok',
      }),
    ).toMatchObject({
      status: 'done',
      result: 'ok',
    });
    expect(
      TaskStateMachine.transition({ ...task('a'), status: 'failed' }, 'running'),
    ).toMatchObject({
      status: 'running',
    });
    expect(TaskStateMachine.transition(task('a'), 'skipped')).toMatchObject({
      status: 'skipped',
    });
  });

  it('rejects invalid task transitions', () => {
    expect(() =>
      TaskStateMachine.transition({ ...task('a'), status: 'done' }, 'running'),
    ).toThrow('Invalid task transition: done -> running');
  });
});

describe('TaskGraph', () => {
  it('sorts tasks by dependency order', () => {
    const graph = new TaskGraph([task('build', ['plan']), task('plan')]);

    expect(graph.topologicalSort().map((item) => item.id)).toEqual([
      'plan',
      'build',
    ]);
  });

  it('rejects missing dependencies', () => {
    expect(() => new TaskGraph([task('build', ['missing'])])).toThrow(
      'Task build depends on missing task missing',
    );
  });

  it('rejects circular dependencies', () => {
    expect(() => new TaskGraph([task('a', ['b']), task('b', ['a'])])).toThrow(
      'Task graph contains a cycle',
    );
  });

  it('returns runnable pending tasks whose dependencies are done', () => {
    const graph = new TaskGraph([
      { ...task('plan'), status: 'done' },
      task('build', ['plan']),
      task('review', ['build']),
    ]);

    expect(graph.getRunnableTasks().map((item) => item.id)).toEqual(['build']);
  });
});

describe('SimplePlanner', () => {
  it('creates one task for a simple goal', async () => {
    const planner = new SimplePlanner();

    await expect(planner.plan({ goal: 'Write docs' })).resolves.toMatchObject([
      {
        id: 'task_1',
        title: 'Write docs',
        description: 'Write docs',
        status: 'pending',
        role: 'default',
        dependsOn: [],
      },
    ]);
  });

  it('creates multiple tasks from explicit steps', async () => {
    const planner = new SimplePlanner();

    await expect(
      planner.plan({
        goal: 'Ship feature',
        steps: [
          { title: 'Plan', role: 'planner' },
          { id: 'build', title: 'Build', dependsOn: ['task_1'], role: 'builder' },
        ],
      }),
    ).resolves.toMatchObject([
      {
        id: 'task_1',
        title: 'Plan',
        role: 'planner',
        dependsOn: [],
      },
      {
        id: 'build',
        title: 'Build',
        role: 'builder',
        dependsOn: ['task_1'],
      },
    ]);
  });
});

describe('Coordinator', () => {
  it('executes tasks in dependency order', async () => {
    const order: string[] = [];
    const coordinator = new Coordinator({
      handlers: {
        default: async (currentTask) => {
          order.push(currentTask.id);
          return { result: `${currentTask.id} done` };
        },
      },
    });

    const result = await coordinator.run([
      task('build', ['plan']),
      task('plan'),
      task('review', ['build']),
    ]);

    expect(order).toEqual(['plan', 'build', 'review']);
    expect(result.tasks.map((item) => item.status)).toEqual(['done', 'done', 'done']);
  });

  it('dispatches tasks to role-specific handlers', async () => {
    const planner = vi.fn(async () => ({ result: 'planned' }));
    const builder = vi.fn(async () => ({ result: 'built' }));
    const coordinator = new Coordinator({
      handlers: {
        planner,
        builder,
      },
    });

    await coordinator.run([
      { ...task('plan'), role: 'planner' },
      { ...task('build', ['plan']), role: 'builder' },
    ]);

    expect(planner).toHaveBeenCalledOnce();
    expect(builder).toHaveBeenCalledOnce();
  });

  it('retries failed tasks before marking them done', async () => {
    let attempts = 0;
    const coordinator = new Coordinator({
      maxRetries: 1,
      handlers: {
        default: async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('temporary failure');
          }

          return { result: 'recovered' };
        },
      },
    });

    const result = await coordinator.run([task('retry')]);

    expect(attempts).toBe(2);
    expect(result.tasks[0]).toMatchObject({
      status: 'done',
      result: 'recovered',
    });
  });

  it('skips dependent tasks when failure is downgraded', async () => {
    const coordinator = new Coordinator({
      maxRetries: 0,
      continueOnFailure: true,
      handlers: {
        default: async (currentTask) => {
          if (currentTask.id === 'plan') {
            throw new Error('cannot plan');
          }

          return { result: 'done' };
        },
      },
    });

    const result = await coordinator.run([task('plan'), task('build', ['plan'])]);

    expect(result.tasks).toMatchObject([
      { id: 'plan', status: 'failed', error: 'cannot plan' },
      { id: 'build', status: 'skipped' },
    ]);
  });
});

describe('Evaluator', () => {
  it('parses conservative evaluator pass results', () => {
    const result = evaluateOutput({
      criteria: ['must mention risk', 'must include next step'],
      output: 'This mentions risk and includes next step.',
      evaluationText: 'PASS\nconfidence: high',
    });

    expect(result).toEqual({
      passed: true,
      confidence: 'high',
      issues: [],
    });
  });

  it('fails when evaluator lists issues', () => {
    const result = evaluateOutput({
      criteria: ['must mention risk'],
      output: 'done',
      evaluationText: 'FAIL\n- missing risk discussion\nconfidence: medium',
    });

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe('medium');
    expect(result.issues).toEqual(['missing risk discussion']);
  });
});
