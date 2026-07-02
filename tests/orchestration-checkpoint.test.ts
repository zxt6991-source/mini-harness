import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  FileCheckpointStore,
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

  it('persists workflow checkpoints across file store instances', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'miniharness-checkpoints-'));
    const firstStore = new FileCheckpointStore({ rootDir });
    const checkpoint = createWorkflowCheckpoint({
      workflowRunId: 'workflow/file:test',
      workflowDefinitionId: 'workflow_def',
      currentState: 'review',
      taskExecutions: [],
      messages: [],
      scratchpad: {
        entries: [
          {
            key: 'note',
            value: { accepted: true },
            version: 1,
            writerId: 'reviewer',
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
      },
    });

    await firstStore.save(checkpoint);

    const secondStore = new FileCheckpointStore({ rootDir });
    await expect(secondStore.load('workflow/file:test')).resolves.toMatchObject({
      workflowRunId: 'workflow/file:test',
      currentState: 'review',
      scratchpad: {
        entries: [
          {
            key: 'note',
            value: { accepted: true },
          },
        ],
      },
    });
  });
});
