import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { ConsolidationEngine } from '../src/memory/consolidation';
import { MarkdownMemoryStore } from '../src/memory/markdown-store';
import { SessionLogStore } from '../src/memory/session-log';

function message(id: string, role: Message['role'], content: string): Message {
  return {
    id,
    role,
    content,
    createdAt: Number(id.slice(1)) || 1,
  };
}

describe('ConsolidationEngine', () => {
  it('uses explicit memory signals to write long-term entries', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-consolidation-'));
    const entryStore = new MarkdownMemoryStore({ rootDir, now: () => 2000 });
    const sessionLog = new SessionLogStore({ rootDir: join(rootDir, 'session_logs') });
    const engine = new ConsolidationEngine({
      entryStore,
      sessionLog,
      options: {
        enabled: true,
        timeGateMs: 86400000,
        sessionGate: 5,
        contextUtilizationGate: 0.7,
        minMessages: 1,
        prune: {
          expiredEntries: true,
          lowConfidenceThreshold: 0.3,
          staleDays: 30,
        },
      },
      now: () => 2000,
    });

    await sessionLog.append('s1', message('m1', 'user', '记住这个：我偏好简洁的中文回复'));
    await engine.onRunEnd({
      sessionId: 's1',
      traceId: 'trace_1',
      userMessage: message('m2', 'user', '保存进度'),
      finalMessage: message('m3', 'assistant', '已完成项目 memory phase'),
      terminationReason: 'no_tool_calls',
    });

    const entries = await entryStore.list({ includeExpired: true });
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'user',
          content: expect.stringContaining('偏好简洁'),
        }),
        expect.objectContaining({
          type: 'project',
          content: expect.stringContaining('已完成项目 memory phase'),
        }),
      ]),
    );
  });

  it('does not consolidate when gates are closed', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-consolidation-'));
    const entryStore = new MarkdownMemoryStore({ rootDir, now: () => 2000 });
    const sessionLog = new SessionLogStore({ rootDir: join(rootDir, 'session_logs') });
    const engine = new ConsolidationEngine({
      entryStore,
      sessionLog,
      options: {
        enabled: true,
        timeGateMs: 86400000,
        sessionGate: 5,
        contextUtilizationGate: 0.7,
        minMessages: 8,
        prune: {
          expiredEntries: true,
          lowConfidenceThreshold: 0.3,
          staleDays: 30,
        },
      },
      now: () => 2000,
    });

    await engine.onRunEnd({
      sessionId: 's1',
      traceId: 'trace_1',
      userMessage: message('m1', 'user', 'hello'),
      finalMessage: message('m2', 'assistant', 'hi'),
      terminationReason: 'no_tool_calls',
    });

    await expect(entryStore.list()).resolves.toEqual([]);
  });
});
