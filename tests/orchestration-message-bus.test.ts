import { describe, expect, it } from 'vitest';
import { AgentExecutionContext } from '../src/orchestration/agent-context';
import { OrchestrationMessageBus } from '../src/orchestration/message-bus';
import { Scratchpad } from '../src/orchestration/scratchpad';

describe('OrchestrationMessageBus', () => {
  it('assigns ordered sequence numbers and deduplicates idempotent messages', async () => {
    const bus = new OrchestrationMessageBus({ maxQueueSize: 10 });

    const first = await bus.send({
      workflowRunId: 'workflow_1',
      sourceAgentId: 'planner',
      targetAgentIds: ['builder'],
      type: 'agent_note',
      payload: { note: 'build it' },
      priority: 'normal',
      idempotencyKey: 'planner:note:1',
    });
    const duplicate = await bus.send({
      workflowRunId: 'workflow_1',
      sourceAgentId: 'planner',
      targetAgentIds: ['builder'],
      type: 'agent_note',
      payload: { note: 'build it again' },
      priority: 'normal',
      idempotencyKey: 'planner:note:1',
    });

    expect(duplicate).toEqual(first);
    expect(bus.list('workflow_1').map((message) => message.sequence)).toEqual([1]);
    expect(bus.receiveForAgent('workflow_1', 'builder')).toMatchObject([
      {
        sequence: 1,
        payload: { note: 'build it' },
      },
    ]);
  });

  it('applies backpressure when the workflow queue is full', async () => {
    const bus = new OrchestrationMessageBus({ maxQueueSize: 1 });

    await bus.send({
      workflowRunId: 'workflow_1',
      type: 'agent_note',
      payload: {},
      priority: 'normal',
    });

    await expect(
      bus.send({
        workflowRunId: 'workflow_1',
        type: 'agent_note',
        payload: {},
        priority: 'normal',
      }),
    ).rejects.toThrow('MESSAGE_BACKPRESSURE');
  });
});

describe('Scratchpad', () => {
  it('tracks versions, read-only entries, and restores from snapshots', () => {
    const scratchpad = new Scratchpad();

    scratchpad.put('plan', 'v1', 'planner');
    scratchpad.put('plan', 'v2', 'planner');
    scratchpad.put('requirements', ['fast'], 'planner', { readOnly: true });

    expect(scratchpad.get('plan', 'builder')).toBe('v2');
    expect(scratchpad.getEntry('plan')).toMatchObject({
      version: 1,
      writerId: 'planner',
    });
    expect(() =>
      scratchpad.put('requirements', ['changed'], 'builder'),
    ).toThrow('Scratchpad entry requirements is read-only');

    const restored = Scratchpad.fromSnapshot(scratchpad.snapshot());
    expect(restored.batchGet(['plan', 'requirements'], 'reviewer')).toEqual({
      plan: 'v2',
      requirements: ['fast'],
    });
  });
});

describe('AgentExecutionContext', () => {
  it('isolates child local state and commits explicitly to the parent', () => {
    const scratchpad = new Scratchpad();
    const messageBus = new OrchestrationMessageBus();
    const parent = new AgentExecutionContext({
      agentId: 'parent',
      workflowRunId: 'workflow_1',
      scratchpad,
      messageBus,
      initialValues: { requirement: 'ship' },
    });
    const child = parent.createChild('builder');

    child.set('artifact', 'dist');

    expect(child.get('requirement')).toBe('ship');
    expect(parent.get('artifact')).toBeUndefined();

    child.commitToParent(['artifact']);

    expect(parent.get('artifact')).toBe('dist');
  });
});
