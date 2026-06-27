import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { InMemoryStore } from '../src/memory/local-store';

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    createdAt: Date.now(),
  };
}

describe('InMemoryStore', () => {
  it('saves and loads recent messages per session', async () => {
    const store = new InMemoryStore();

    await store.save('a', message('m1', 'first'));
    await store.save('a', message('m2', 'second'));
    await store.save('b', message('m3', 'other'));

    await expect(store.loadRecent('a', 1)).resolves.toMatchObject([
      { id: 'm2', content: 'second' },
    ]);
    await expect(store.loadRecent('b', 5)).resolves.toMatchObject([
      { id: 'm3', content: 'other' },
    ]);
  });

  it('searches messages by content within one session', async () => {
    const store = new InMemoryStore();

    await store.save('a', message('m1', 'alpha one'));
    await store.save('a', message('m2', 'beta two'));
    await store.save('a', message('m3', 'alpha three'));

    await expect(store.search('a', 'alpha', 1)).resolves.toMatchObject([
      { id: 'm1' },
    ]);
  });

  it('builds context with a system prompt, recent messages, and current input', async () => {
    const store = new InMemoryStore();
    const input = message('m2', 'current');

    await store.save('a', message('m1', 'previous'));

    const context = await store.buildContext('a', input);

    expect(context).toMatchObject([
      { role: 'system', content: 'You are MiniHarness Agent.' },
      { id: 'm1', content: 'previous' },
      { id: 'm2', content: 'current' },
    ]);
  });
});
