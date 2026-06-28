// 该文件根据配置创建 MiniHarness 的记忆实现。
import { join } from 'node:path';
import type { Memory } from '../core';
import { ContextBuilder } from './context-builder';
import { ConsolidationEngine } from './consolidation';
import { ConsolidatingMemory } from './consolidating-memory';
import { InMemoryStore } from './local-store';
import { MarkdownMemoryStore } from './markdown-store';
import { SessionLogStore } from './session-log';
import { SimpleSummarizer } from './summarizer';

export interface MemoryConfig {
  type: 'local' | 'in-memory';
  rootDir?: string;
  recentLimit: number;
  searchTopK: number;
  summary: {
    enabled: boolean;
    maxSummaryCharacters: number;
  };
  context: {
    systemPrompt: string;
    maxContextCharacters: number;
    protectedCharacters?: number;
    minSectionCharacters?: number;
    cache?: {
      enabled: boolean;
      staticTtlMs: number;
      dynamicTtlMs: number;
    };
  };
  consolidation?: {
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
  };
  index?: {
    keyword: {
      enabled: boolean;
      minTokenLength: number;
    };
    vector: {
      enabled: boolean;
    };
  };
}

export function createMemory(config: MemoryConfig): Memory {
  const summarizer = config.summary.enabled
    ? new SimpleSummarizer({
        maxSummaryCharacters: config.summary.maxSummaryCharacters,
      })
    : undefined;
  const contextBuilder = new ContextBuilder({
    systemPrompt: config.context.systemPrompt,
    recentLimit: config.recentLimit,
    searchTopK: config.searchTopK,
    maxContextCharacters: config.context.maxContextCharacters,
    summarizer,
  });

  if (config.type === 'in-memory') {
    return new InMemoryStore(contextBuilder);
  }

  const rootDir = config.rootDir ?? '.miniharness/memory';

  const entryStore = new MarkdownMemoryStore({ rootDir });
  const sessionLog = new SessionLogStore({ rootDir: join(rootDir, 'session_logs') });
  const consolidation = config.consolidation?.enabled
    ? new ConsolidationEngine({
        entryStore,
        sessionLog,
        options: config.consolidation,
      })
    : undefined;

  return new ConsolidatingMemory({
    entryStore,
    sessionLog,
    contextBuilder,
    consolidation,
  });
}
