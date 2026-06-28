// 该文件提供内存版会话存储，用于保存、检索和构建当前进程内的对话上下文。
import type { Memory, Message } from '../core';
import { createId } from '../utils/id';
import type { ContextBuilder } from './context-builder';

/** 创建默认系统消息，用于没有自定义上下文构建器时补齐模型提示。 */
function createSystemMessage(content: string): Message {
  return {
    id: createId('msg'),
    role: 'system',
    content,
    createdAt: Date.now(),
  };
}

/** 进程内存版会话存储，适合测试、示例和无需持久化的运行场景。 */
export class InMemoryStore implements Memory {
  private readonly sessions = new Map<string, Message[]>();

  /** 可选注入上下文构建器，用于覆盖默认的最近消息上下文策略。 */
  constructor(private readonly contextBuilder?: ContextBuilder) {}

  /** 将一条消息追加保存到指定会话。 */
  async save(sessionId: string, message: Message): Promise<void> {
    const messages = this.sessions.get(sessionId) ?? [];
    messages.push(message);
    this.sessions.set(sessionId, messages);
  }

  /** 按时间顺序返回指定会话最近的若干条消息。 */
  async loadRecent(sessionId: string, limit: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) ?? [];
    return messages.slice(-limit);
  }

  /** 用简单字符串包含匹配在会话历史中查找相关消息。 */
  async search(sessionId: string, query: string, topK: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) ?? [];

    return messages
      .filter((message) => message.content.includes(query))
      .slice(0, topK);
  }

  /** 构建模型上下文；有自定义构建器时委托给构建器，否则使用默认 system 加最近消息。 */
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
