import { describe, expect, it } from 'vitest';
import {
  InMemoryCheckpointStore,
  createWorkflowCheckpoint,
} from '../src/orchestration/checkpoint';
import { createTaskExecution, normalizeTaskSpec } from '../src/orchestration/execution';

describe('orchestration checkpoints', () => {
  it('saves and loads workflow checkpoints by run id', async () => {
    const store = new InMemoryCheckpointStore();
    const spec = normalizeTaskSpec({
      id: 'plan',
      title: 'Plan',
      description: 'Plan work',
      status: 'pending',
      dependsOn: [],
    });
    const execution = {
      ...createTaskExecution(spec, { runId: 'workflow_1' }),
      status: 'completed' as const,
      result: { output: 'planned' },
    };
    const checkpoint = createWorkflowCheckpoint({
      workflowRunId: 'workflow_1',
      workflowDefinitionId: 'workflow_def',
      currentState: 'synthesis',
      taskExecutions: [execution],
      messages: [],
      scratchpad: {
        entries: [
          {
            key: 'plan',
            value: 'planned',
            version: 0,
            writerId: 'planner',
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      },
    });

    await store.save(checkpoint);

    await expect(store.load('workflow_1')).resolves.toMatchObject({
      workflowRunId: 'workflow_1',
      workflowDefinitionId: 'workflow_def',
      currentState: 'synthesis',
      taskExecutions: [
        {
          taskId: 'plan',
          status: 'completed',
          result: { output: 'planned' },
        },
      ],
      scratchpad: {
        entries: [
          {
            key: 'plan',
            value: 'planned',
          },
        ],
      },
    });
  });
});
