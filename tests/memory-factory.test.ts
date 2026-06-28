import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { createMemory } from '../src/memory/factory';
import { ConsolidatingMemory } from '../src/memory/consolidating-memory';

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    createdAt: Date.now(),
  };
}

describe('createMemory', () => {
  it('creates a configured persistent memory implementation', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-factory-'));
    const memory = createMemory({
      type: 'local',
      rootDir,
      recentLimit: 2,
      searchTopK: 0,
      summary: { enabled: false, maxSummaryCharacters: 500 },
      context: {
        systemPrompt: 'Custom system',
        maxContextCharacters: 1000,
        protectedCharacters: 200,
        minSectionCharacters: 100,
        cache: {
          enabled: false,
          staticTtlMs: 600000,
          dynamicTtlMs: 30000,
        },
      },
      consolidation: {
        enabled: false,
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
      index: {
        keyword: { enabled: true, minTokenLength: 2 },
        vector: { enabled: false },
      },
    });

    expect(memory).toBeInstanceOf(ConsolidatingMemory);
    await memory.save('s1', message('m1', 'previous'));

    const context = await memory.buildContext('s1', message('m2', 'current'));

    expect(context).toMatchObject([
      { role: 'system', content: 'Custom system' },
      { id: 'm1', content: 'previous' },
      { id: 'm2', content: 'current' },
    ]);
  });
});
