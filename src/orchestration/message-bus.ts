// 该文件实现单进程编排消息总线，支持顺序消息、幂等去重和简单背压。
import { createId } from '../utils/id';

export type OrchestrationMessageType =
  | 'task_result'
  | 'agent_note'
  | 'approval_request'
  | 'error'
  | 'control';

export type OrchestrationMessagePriority =
  | 'low'
  | 'normal'
  | 'high'
  | 'critical';

export interface OrchestrationMessage {
  id: string;
  sequence: number;
  workflowRunId: string;
  sourceTaskId?: string;
  sourceAgentId?: string;
  targetTaskIds?: string[];
  targetAgentIds?: string[];
  type: OrchestrationMessageType;
  payload: Record<string, unknown>;
  priority: OrchestrationMessagePriority;
  timestamp: number;
  ttlMs?: number;
  requiresAck?: boolean;
  idempotencyKey?: string;
  acknowledgedAt?: number;
}

export type OrchestrationMessageInput = Omit<
  OrchestrationMessage,
  'id' | 'sequence' | 'timestamp' | 'acknowledgedAt'
> &
  Partial<Pick<OrchestrationMessage, 'id' | 'sequence' | 'timestamp'>>;

export interface OrchestrationMessageBusOptions {
  maxQueueSize?: number;
  now?: () => number;
}

/** 内存消息总线，按 workflowRunId 维护 FIFO 消息序列。 */
export class OrchestrationMessageBus {
  private readonly queues = new Map<string, OrchestrationMessage[]>();
  private readonly idempotencyIndex = new Map<string, OrchestrationMessage>();
  private readonly maxQueueSize: number;
  private readonly now: () => number;

  /** 初始化消息总线容量和时间源。 */
  constructor(options: OrchestrationMessageBusOptions = {}) {
    this.maxQueueSize = options.maxQueueSize ?? 1_000;
    this.now = options.now ?? Date.now;
  }

  /** 发送消息。重复 idempotencyKey 会返回首次消息，避免重复副作用。 */
  async send(input: OrchestrationMessageInput): Promise<OrchestrationMessage> {
    const now = this.now();
    const indexKey = input.idempotencyKey
      ? `${input.workflowRunId}:${input.idempotencyKey}`
      : undefined;
    const existing = indexKey ? this.idempotencyIndex.get(indexKey) : undefined;

    if (existing) {
      return existing;
    }

    const queue = this.queues.get(input.workflowRunId) ?? [];
    this.pruneExpired(queue, now);
    if (queue.length >= this.maxQueueSize) {
      throw new Error('MESSAGE_BACKPRESSURE');
    }

    const message: OrchestrationMessage = {
      ...input,
      id: input.id ?? createId('omsg'),
      sequence: input.sequence ?? queue.length + 1,
      timestamp: input.timestamp ?? now,
    };

    queue.push(message);
    this.queues.set(input.workflowRunId, queue);
    if (indexKey) {
      this.idempotencyIndex.set(indexKey, message);
    }

    return message;
  }

  /** 返回 workflow 的有效消息。 */
  list(workflowRunId: string): OrchestrationMessage[] {
    const queue = this.queues.get(workflowRunId) ?? [];
    this.pruneExpired(queue, this.now());
    return [...queue];
  }

  /** 读取发给某个 agent 的消息。 */
  receiveForAgent(
    workflowRunId: string,
    agentId: string,
  ): OrchestrationMessage[] {
    return this.list(workflowRunId).filter(
      (message) =>
        !message.targetAgentIds ||
        message.targetAgentIds.length === 0 ||
        message.targetAgentIds.includes(agentId),
    );
  }

  /** 确认消息已被消费。 */
  acknowledge(workflowRunId: string, messageId: string): boolean {
    const message = this.list(workflowRunId).find((item) => item.id === messageId);
    if (!message) {
      return false;
    }

    message.acknowledgedAt = this.now();
    return true;
  }

  private pruneExpired(queue: OrchestrationMessage[], now: number): void {
    for (let index = queue.length - 1; index >= 0; index--) {
      const message = queue[index];
      if (message.ttlMs && now - message.timestamp > message.ttlMs) {
        queue.splice(index, 1);
      }
    }
  }
}

