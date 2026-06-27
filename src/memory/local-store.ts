import type { Memory, Message } from '../core';
import { createId } from '../utils/id';
import type { ContextBuilder } from './context-builder';

function createSystemMessage(content: string): Message {
  return {
    id: createId('msg'),
    role: 'system',
    content,
    createdAt: Date.now(),
  };
}

export class InMemoryStore implements Memory {
  private readonly sessions = new Map<string, Message[]>();

  constructor(private readonly contextBuilder?: ContextBuilder) {}

  async save(sessionId: string, message: Message): Promise<void> {
    const messages = this.sessions.get(sessionId) ?? [];
    messages.push(message);
    this.sessions.set(sessionId, messages);
  }

  async loadRecent(sessionId: string, limit: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) ?? [];
    return messages.slice(-limit);
  }

  async search(sessionId: string, query: string, topK: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) ?? [];

    return messages
      .filter((message) => message.content.includes(query))
      .slice(0, topK);
  }

  async buildContext(sessionId: string, input: Message): Promise<Message[]> {
    if (this.contextBuilder) {
      return this.contextBuilder.build(this, sessionId, input);
    }

    const recent = await this.loadRecent(sessionId, 20);

    return [
      createSystemMessage('You are MiniHarness Agent.'),
      ...recent,
      input,
    ];
  }
}
