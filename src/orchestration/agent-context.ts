// 该文件定义多 agent 编排时的分层执行上下文。
import type { OrchestrationMessageBus } from './message-bus';
import type { Scratchpad } from './scratchpad';

export interface AgentExecutionContextOptions {
  agentId: string;
  workflowRunId: string;
  parent?: AgentExecutionContext;
  scratchpad: Scratchpad;
  messageBus: OrchestrationMessageBus;
  initialValues?: Record<string, unknown>;
}

/** 分层 agent 上下文。本地写入默认不会污染父上下文。 */
export class AgentExecutionContext {
  readonly agentId: string;
  readonly workflowRunId: string;
  readonly parent: AgentExecutionContext | undefined;
  readonly local = new Map<string, unknown>();
  readonly inherited: ReadonlyMap<string, unknown>;
  readonly scratchpad: Scratchpad;
  readonly messageBus: OrchestrationMessageBus;

  /** 初始化上下文，并把父级 local 作为只读继承快照。 */
  constructor(options: AgentExecutionContextOptions) {
    this.agentId = options.agentId;
    this.workflowRunId = options.workflowRunId;
    this.parent = options.parent;
    this.scratchpad = options.scratchpad;
    this.messageBus = options.messageBus;
    this.inherited = new Map(options.parent?.local ?? []);

    for (const [key, value] of Object.entries(options.initialValues ?? {})) {
      this.local.set(key, value);
    }
  }

  /** 创建子上下文，继承当前 local 的只读快照。 */
  createChild(agentId: string): AgentExecutionContext {
    return new AgentExecutionContext({
      agentId,
      workflowRunId: this.workflowRunId,
      parent: this,
      scratchpad: this.scratchpad,
      messageBus: this.messageBus,
    });
  }

  /** 本地优先、继承其次读取上下文变量。 */
  get(key: string, defaultValue?: unknown): unknown {
    if (this.local.has(key)) {
      return this.local.get(key);
    }

    return this.inherited.has(key) ? this.inherited.get(key) : defaultValue;
  }

  /** 设置本地变量。 */
  set(key: string, value: unknown): void {
    this.local.set(key, value);
  }

  /** 显式把部分本地变量提交给父上下文。 */
  commitToParent(keys: string[]): void {
    if (!this.parent) {
      return;
    }

    for (const key of keys) {
      if (this.local.has(key)) {
        this.parent.set(key, this.local.get(key));
      }
    }
  }
}

