// 该文件定义长期记忆条目、搜索请求和上下文片段等记忆子系统共享类型。
import type { Message } from '../core';

export type MemoryEntryType =
  | 'user'
  | 'feedback'
  | 'project'
  | 'reference'
  | 'episodic'
  | 'lesson';

export interface MemoryEntry {
  id: string;
  type: MemoryEntryType;
  content: string;
  tags: string[];
  confidence: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  expiryAt?: number;
  sourceSessionId?: string;
  sourceMessageIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface MemorySearchQuery {
  sessionId?: string;
  query: string;
  types?: MemoryEntryType[];
  tags?: string[];
  topK: number;
  minConfidence?: number;
  now?: number;
}

export interface MemorySearchHit {
  entry: MemoryEntry;
  score: number;
  reasons: string[];
}

export interface ContextSection {
  name: string;
  priority: number;
  messages?: Message[];
  content?: string;
  protected?: boolean;
  tags?: string[];
}
