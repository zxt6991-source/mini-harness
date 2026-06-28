// 该文件定义记忆存储接口，描述会话消息的保存、检索和上下文构建能力。
import type { Message } from './message';

export interface Memory {
  save(sessionId: string, message: Message): Promise<void>;
  loadRecent(sessionId: string, limit: number): Promise<Message[]>;
  search(sessionId: string, query: string, topK: number): Promise<Message[]>;
  buildContext(sessionId: string, input: Message): Promise<Message[]>;
}
