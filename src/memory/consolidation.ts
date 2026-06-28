// 该文件实现记忆整合引擎：按触发门判断是否把会话日志沉淀为长期记忆。
import type { MemoryRunEndEvent, Message } from '../core';
import { createId } from '../utils/id';
import { logger } from '../reliability/logger';
import type { MemoryEntryStore } from './entry-store';
import type { SessionLogStore } from './session-log';
import type { MemoryEntry, MemoryEntryType } from './types';

export interface ConsolidationOptions {
  enabled: boolean;
  timeGateMs: number;
  sessionGate: number;
  contextUtilizationGate: number;
  minMessages: number;
  prune: {
    expiredEntries: boolean;
    lowConfidenceThreshold: number;
    staleDays: number;
  };
}

export interface ConsolidationEngineOptions {
  entryStore: MemoryEntryStore;
  sessionLog: SessionLogStore;
  options: ConsolidationOptions;
  now?: () => number;
}

interface GatheredMemory {
  type: MemoryEntryType;
  content: string;
  tags: string[];
  confidence: number;
  sourceMessageIds: string[];
}

function containsAny(content: string, words: string[]): boolean {
  const normalized = content.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function compactContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function classifyMessage(message: Message): GatheredMemory[] {
  const content = compactContent(message.content);
  const gathered: GatheredMemory[] = [];

  if (!content) {
    return gathered;
  }

  if (
    message.role === 'user' &&
    containsAny(content, ['记住', '偏好', '习惯', 'prefer', 'remember'])
  ) {
    gathered.push({
      type: 'user',
      content,
      tags: ['user_profile'],
      confidence: 0.9,
      sourceMessageIds: [message.id],
    });
  }

  if (
    containsAny(content, [
      '项目',
      '进度',
      '架构',
      '完成',
      'project',
      'progress',
      'architecture',
      'completed',
    ])
  ) {
    gathered.push({
      type: 'project',
      content,
      tags: ['project_context'],
      confidence: message.role === 'assistant' ? 0.8 : 0.7,
      sourceMessageIds: [message.id],
    });
  }

  if (
    containsAny(content, [
      '错误',
      '失败',
      '教训',
      'bug',
      'error',
      'failure',
      'lesson',
    ])
  ) {
    gathered.push({
      type: 'lesson',
      content,
      tags: ['lesson'],
      confidence: 0.75,
      sourceMessageIds: [message.id],
    });
  }

  return gathered;
}

function hasExplicitSignal(event: MemoryRunEndEvent): boolean {
  return containsAny(event.userMessage.content, [
    '保存进度',
    '记住这个',
    'consolidate',
    'save progress',
    'remember this',
  ]);
}

function dedupeGathered(items: GatheredMemory[]): GatheredMemory[] {
  const seen = new Set<string>();
  const result: GatheredMemory[] = [];

  for (const item of items) {
    const key = `${item.type}:${item.content}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

export class ConsolidationEngine {
  private readonly now: () => number;
  private lastConsolidationAt: number;
  private sessionsSinceConsolidation = 0;

  constructor(private readonly config: ConsolidationEngineOptions) {
    this.now = config.now ?? Date.now;
    this.lastConsolidationAt = this.now();
  }

  async onRunEnd(event: MemoryRunEndEvent): Promise<boolean> {
    if (!this.config.options.enabled) {
      return false;
    }

    this.sessionsSinceConsolidation++;

    const recentMessages = await this.config.sessionLog.readRecent(
      event.sessionId,
      100,
    );
    const messages = [
      ...recentMessages,
      event.userMessage,
      ...(event.finalMessage ? [event.finalMessage] : []),
    ];

    if (!this.shouldConsolidate(event, messages.length)) {
      return false;
    }

    try {
      const gathered = dedupeGathered(messages.flatMap(classifyMessage));

      for (const item of gathered) {
        await this.config.entryStore.save(this.toEntry(event.sessionId, item));
      }

      await this.prune();
      this.lastConsolidationAt = this.now();
      this.sessionsSinceConsolidation = 0;
      return gathered.length > 0;
    } catch (error) {
      logger.warn({ error, sessionId: event.sessionId }, 'memory consolidation failed');
      return false;
    }
  }

  private shouldConsolidate(event: MemoryRunEndEvent, messageCount: number): boolean {
    if (messageCount < this.config.options.minMessages) {
      return false;
    }

    const timeGate = this.now() - this.lastConsolidationAt >= this.config.options.timeGateMs;
    const sessionGate =
      this.sessionsSinceConsolidation >= this.config.options.sessionGate;
    const explicitGate = hasExplicitSignal(event);

    return timeGate || sessionGate || explicitGate;
  }

  private toEntry(sessionId: string, item: GatheredMemory): MemoryEntry {
    const now = this.now();

    return {
      id: createId('mem'),
      type: item.type,
      content: item.content,
      tags: item.tags,
      confidence: item.confidence,
      version: 1,
      createdAt: now,
      updatedAt: now,
      sourceSessionId: sessionId,
      sourceMessageIds: item.sourceMessageIds,
    };
  }

  private async prune(): Promise<void> {
    if (!this.config.options.prune.expiredEntries) {
      return;
    }

    const now = this.now();
    const staleBefore =
      now - this.config.options.prune.staleDays * 24 * 60 * 60 * 1000;
    const entries = await this.config.entryStore.list({
      includeExpired: true,
      now,
    });

    for (const entry of entries) {
      const expired = entry.expiryAt !== undefined && entry.expiryAt <= now;
      const staleLowConfidence =
        entry.confidence < this.config.options.prune.lowConfidenceThreshold &&
        entry.updatedAt < staleBefore;

      if (expired || staleLowConfidence) {
        await this.config.entryStore.delete(entry.id);
      }
    }
  }
}
