// 该文件负责为模型请求组装上下文，合并系统提示、摘要、相关记忆和最近消息。
import type { Memory, Message } from '../core';
import { createId } from '../utils/id';
import type { Summarizer } from './summarizer';
import { analyzeContextRequirement } from './context-requirement';
import type { MemorySearchHit, MemorySearchQuery } from './types';

export interface ContextBuilderOptions {
  systemPrompt?: string;
  recentLimit?: number;
  searchTopK?: number;
  maxContextCharacters?: number;
  summarizer?: Summarizer;
}

/** 创建用于注入系统提示或摘要内容的 system 消息。 */
function createSystemMessage(content: string): Message {
  return {
    id: createId('msg'),
    role: 'system',
    content,
    createdAt: Date.now(),
  };
}

/** 统计一组消息正文的总字符数，用于控制上下文长度。 */
function totalContentLength(messages: Message[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

/** 按最大字符数裁剪上下文，优先移除非系统消息并保留当前输入。 */
function trimContext(messages: Message[], inputId: string, maxCharacters: number): Message[] {
  const trimmed = [...messages];

  while (totalContentLength(trimmed) > maxCharacters) {
    const removableIndex = trimmed.findIndex(
      (message) => message.role !== 'system' && message.id !== inputId,
    );

    if (removableIndex === -1) {
      break;
    }

    trimmed.splice(removableIndex, 1);
  }

  const excess = totalContentLength(trimmed) - maxCharacters;
  if (excess > 0) {
    const firstTrimmable = trimmed.find(
      (message) => message.role === 'system' && message.content.length > excess,
    );

    if (firstTrimmable) {
      firstTrimmable.content = firstTrimmable.content.slice(0, -excess);
    }
  }

  return trimmed;
}

interface LongTermMemorySearch {
  searchEntries(query: MemorySearchQuery): Promise<MemorySearchHit[]>;
}

function canSearchEntries(memory: Memory): memory is Memory & LongTermMemorySearch {
  return (
    'searchEntries' in memory &&
    typeof (memory as { searchEntries?: unknown }).searchEntries === 'function'
  );
}

function formatLongTermMemory(hits: MemorySearchHit[]): string {
  return hits
    .map((hit) => `- [${hit.entry.type}] ${hit.entry.content}`)
    .join('\n');
}

/** 根据最近消息、相关检索结果和摘要构建模型请求上下文。 */
export class ContextBuilder {
  private readonly systemPrompt: string;
  private readonly recentLimit: number;
  private readonly searchTopK: number;

  /** 初始化上下文构建参数，包括系统提示、最近消息数量和检索数量。 */
  constructor(private readonly options: ContextBuilderOptions = {}) {
    this.systemPrompt = options.systemPrompt ?? 'You are MiniHarness Agent.';
    this.recentLimit = options.recentLimit ?? 20;
    this.searchTopK = options.searchTopK ?? 0;
  }

  /** 从记忆中收集上下文材料，并组装成模型调用需要的消息列表。 */
  async build(memory: Memory, sessionId: string, input: Message): Promise<Message[]> {
    const recent =
      this.recentLimit > 0 ? await memory.loadRecent(sessionId, this.recentLimit) : [];
    const relevant = await this.searchRelevant(memory, sessionId, input);
    const longTermMemory = await this.searchLongTermMemory(memory, sessionId, input);
    const summary = this.options.summarizer
      ? await this.options.summarizer.summarize(recent)
      : '';

    const messages: Message[] = [createSystemMessage(this.systemPrompt)];

    if (summary.length > 0) {
      messages.push(createSystemMessage(`Conversation summary: ${summary}`));
    }

    if (longTermMemory.length > 0) {
      messages.push(
        createSystemMessage(`Relevant memory:\n${formatLongTermMemory(longTermMemory)}`),
      );
    }

    const seen = new Set<string>();
    for (const message of [...relevant, ...recent]) {
      if (message.id === input.id || seen.has(message.id)) {
        continue;
      }

      messages.push(message);
      seen.add(message.id);
    }

    messages.push(input);

    return this.options.maxContextCharacters
      ? trimContext(messages, input.id, this.options.maxContextCharacters)
      : messages;
  }

  /** 基于用户输入文本拆分查询词，从记忆中查找相关历史消息。 */
  private async searchRelevant(
    memory: Memory,
    sessionId: string,
    input: Message,
  ): Promise<Message[]> {
    if (this.searchTopK <= 0 || input.content.trim().length === 0) {
      return [];
    }

    const queries = [
      input.content,
      ...input.content
        .split(/\s+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ];
    const results: Message[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      const matches = await memory.search(sessionId, query, this.searchTopK);

      for (const match of matches) {
        if (seen.has(match.id)) {
          continue;
        }

        results.push(match);
        seen.add(match.id);

        if (results.length >= this.searchTopK) {
          return results;
        }
      }
    }

    return results;
  }

  /** 检索长期记忆条目；普通 Memory 实现不提供该能力时自动跳过。 */
  private async searchLongTermMemory(
    memory: Memory,
    sessionId: string,
    input: Message,
  ): Promise<MemorySearchHit[]> {
    if (
      !canSearchEntries(memory) ||
      this.searchTopK <= 0 ||
      input.content.trim().length === 0
    ) {
      return [];
    }

    const requirement = analyzeContextRequirement(input.content);

    return memory.searchEntries({
      sessionId,
      query: input.content,
      topK: this.searchTopK,
      types: requirement.explicitTypes.length > 0 ? requirement.explicitTypes : undefined,
      minConfidence: 0.1,
    });
  }
}
