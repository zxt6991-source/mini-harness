import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { ContextBuilder } from '../src/memory/context-builder';
import { ConsolidatingMemory } from '../src/memory/consolidating-memory';
import { MarkdownMemoryStore } from '../src/memory/markdown-store';
import { SessionLogStore } from '../src/memory/session-log';

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    createdAt: Date.now(),
  };
}

describe('ContextBuilder long-term memory integration', () => {
  it('injects relevant long-term memory as a system section without dropping current input', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-context-long-term-'));
    const entryStore = new MarkdownMemoryStore({ rootDir, now: () => 2000 });
    const memory = new ConsolidatingMemory({
      entryStore,
      sessionLog: new SessionLogStore({ rootDir: join(rootDir, 'session_logs') }),
      contextBuilder: new ContextBuilder({
        systemPrompt: 'System prompt',
        recentLimit: 1,
        searchTopK: 2,
        maxContextCharacters: 180,
      }),
    });

    await entryStore.save({
      id: 'mem_project_alpha',
      type: 'project',
      content: 'Alpha project uses Markdown memory entries.',
      tags: ['alpha'],
      confidence: 0.9,
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    await memory.save('s1', message('m1', 'recent alpha note'));

    const context = await memory.buildContext('s1', message('m2', 'alpha status'));

    expect(context).toMatchObject([
      { role: 'system', content: 'System prompt' },
      {
        role: 'system',
        content: expect.stringContaining('Relevant memory'),
      },
      { id: 'm1', content: 'recent alpha note' },
      { id: 'm2', content: 'alpha status' },
    ]);
    expect(context.at(-1)).toMatchObject({ id: 'm2' });
  });
});
