// 该文件提供 workflow checkpoint 数据结构、内存存储和文件持久化实现。
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

export interface FileCheckpointStoreOptions {
  rootDir: string;
}

function checkpointFileName(workflowRunId: string): string {
  return `${createHash('sha256').update(workflowRunId).digest('hex')}.json`;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** 文件 checkpoint store，适合单机生产和重启恢复。 */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly options: FileCheckpointStoreOptions) {}

  /** 以原子 rename 保存最新 checkpoint。 */
  async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    await mkdir(this.options.rootDir, { recursive: true });
    const saved = createWorkflowCheckpoint(checkpoint);
    const targetPath = this.pathFor(saved.workflowRunId);
    const tempPath = `${targetPath}.${process.pid}.tmp`;

    await writeFile(tempPath, JSON.stringify(saved, null, 2), 'utf8');
    await rename(tempPath, targetPath);
    await appendFile(
      join(this.options.rootDir, 'checkpoints.jsonl'),
      `${JSON.stringify(saved)}\n`,
      'utf8',
    );
  }

  /** 按 workflowRunId 读取最新 checkpoint。 */
  async load(workflowRunId: string): Promise<WorkflowCheckpoint | undefined> {
    try {
      return createWorkflowCheckpoint(
        JSON.parse(await readFile(this.pathFor(workflowRunId), 'utf8')) as WorkflowCheckpoint,
      );
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }

      throw error;
    }
  }

  private pathFor(workflowRunId: string): string {
    return join(this.options.rootDir, checkpointFileName(workflowRunId));
  }
}
