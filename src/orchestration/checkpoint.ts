// 该文件提供 workflow checkpoint 数据结构和内存存储实现。
import type { TaskExecution } from './execution';
import type { OrchestrationMessage } from './message-bus';
import type { ScratchpadSnapshot } from './scratchpad';

export interface WorkflowCheckpoint {
  workflowRunId: string;
  workflowDefinitionId?: string;
  currentState?: string;
  taskExecutions: TaskExecution[];
  messages: OrchestrationMessage[];
  scratchpad: ScratchpadSnapshot;
  createdAt: number;
}

export type WorkflowCheckpointInput = Omit<WorkflowCheckpoint, 'createdAt'> &
  Partial<Pick<WorkflowCheckpoint, 'createdAt'>>;

export interface CheckpointStore {
  save(checkpoint: WorkflowCheckpoint): Promise<void>;
  load(workflowRunId: string): Promise<WorkflowCheckpoint | undefined>;
}

/** 构造 checkpoint，补齐 createdAt。 */
export function createWorkflowCheckpoint(
  input: WorkflowCheckpointInput,
): WorkflowCheckpoint {
  return {
    ...input,
    taskExecutions: input.taskExecutions.map((execution) => ({ ...execution })),
    messages: input.messages.map((message) => ({ ...message })),
    scratchpad: {
      entries: input.scratchpad.entries.map((entry) => ({ ...entry })),
    },
    createdAt: input.createdAt ?? Date.now(),
  };
}

/** 内存 checkpoint store，适合测试和单进程运行。 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, WorkflowCheckpoint>();

  /** 保存 checkpoint。 */
  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.workflowRunId, createWorkflowCheckpoint(checkpoint));
  }

  /** 读取 checkpoint。 */
  async load(workflowRunId: string): Promise<WorkflowCheckpoint | undefined> {
    const checkpoint = this.checkpoints.get(workflowRunId);
    return checkpoint ? createWorkflowCheckpoint(checkpoint) : undefined;
  }
}

