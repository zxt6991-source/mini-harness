import type { Memory, Message } from '../core';
import { createId } from '../utils/id';
import type { Summarizer } from './summarizer';

export interface ContextBuilderOptions {
  systemPrompt?: string;
  recentLimit?: number;
  searchTopK?: number;
  maxContextCharacters?: number;
  summarizer?: Summarizer;
}

function createSystemMessage(content: string): Message {
  return {
    id: createId('msg'),
    role: 'system',
    content,
    createdAt: Date.now(),
  };
}

function totalContentLength(messages: Message[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

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

export class ContextBuilder {
  private readonly systemPrompt: string;
  private readonly recentLimit: number;
  private readonly searchTopK: number;

  constructor(private readonly options: ContextBuilderOptions = {}) {
    this.systemPrompt = options.systemPrompt ?? 'You are MiniHarness Agent.';
    this.recentLimit = options.recentLimit ?? 20;
    this.searchTopK = options.searchTopK ?? 0;
  }

  async build(memory: Memory, sessionId: string, input: Message): Promise<Message[]> {
    const recent =
      this.recentLimit > 0 ? await memory.loadRecent(sessionId, this.recentLimit) : [];
    const relevant = await this.searchRelevant(memory, sessionId, input);
    const summary = this.options.summarizer
      ? await this.options.summarizer.summarize(recent)
      : '';

    const messages: Message[] = [createSystemMessage(this.systemPrompt)];

    if (summary.length > 0) {
      messages.push(createSystemMessage(`Conversation summary: ${summary}`));
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
}
