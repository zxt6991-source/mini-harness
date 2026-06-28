// 该文件组合消息存储、会话日志、长期条目存储和上下文构建器，形成持久化 memory 实现。
import type { Memory, MemoryLifecycle, MemoryRunEndEvent, Message } from '../core';
import type { ContextBuilder } from './context-builder';
import type { MemoryEntryStore } from './entry-store';
import { InMemoryStore } from './local-store';
import type { SessionLogStore } from './session-log';
import type { MemorySearchHit, MemorySearchQuery } from './types';
import type { ConsolidationEngine } from './consolidation';

export interface ConsolidatingMemoryOptions {
  messageStore?: Memory;
  entryStore: MemoryEntryStore;
  sessionLog: SessionLogStore;
  contextBuilder?: ContextBuilder;
  consolidation?: ConsolidationEngine;
}

export class ConsolidatingMemory implements Memory, MemoryLifecycle {
  private readonly messageStore: Memory;
  private readonly contextBuilder?: ContextBuilder;

  constructor(private readonly options: ConsolidatingMemoryOptions) {
    this.contextBuilder = options.contextBuilder;
    this.messageStore =
      options.messageStore ?? new InMemoryStore(options.contextBuilder);
  }

  async save(sessionId: string, message: Message): Promise<void> {
    await this.messageStore.save(sessionId, message);
    await this.options.sessionLog.append(sessionId, message);
  }

  async loadRecent(sessionId: string, limit: number): Promise<Message[]> {
    return this.messageStore.loadRecent(sessionId, limit);
  }

  async search(sessionId: string, query: string, topK: number): Promise<Message[]> {
    return this.messageStore.search(sessionId, query, topK);
  }

  async buildContext(sessionId: string, input: Message): Promise<Message[]> {
    if (this.contextBuilder) {
      return this.contextBuilder.build(this, sessionId, input);
    }

    return this.messageStore.buildContext(sessionId, input);
  }

  async searchEntries(query: MemorySearchQuery): Promise<MemorySearchHit[]> {
    return this.options.entryStore.search(query);
  }

  async onRunEnd(event: MemoryRunEndEvent): Promise<void> {
    await this.options.consolidation?.onRunEnd(event);
  }

  get entryStore(): MemoryEntryStore {
    return this.options.entryStore;
  }

  get sessionLog(): SessionLogStore {
    return this.options.sessionLog;
  }
}
