import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { SessionLogStore } from '../src/memory/session-log';

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    createdAt: Number(id.slice(1)),
  };
}

describe('SessionLogStore', () => {
  it('appends messages as jsonl and reads recent entries per session', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-session-log-'));
    const store = new SessionLogStore({ rootDir });

    await store.append('session_a', message('m1', 'first'));
    await store.append('session_a', message('m2', 'second'));
    await store.append('session_b', message('m3', 'other'));

    await expect(store.readRecent('session_a', 1)).resolves.toMatchObject([
      { id: 'm2', content: 'second' },
    ]);
    await expect(store.readRecent('session_b', 5)).resolves.toMatchObject([
      { id: 'm3', content: 'other' },
    ]);
  });
});
