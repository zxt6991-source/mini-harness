import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { ContextBuilder } from '../src/memory/context-builder';
import { InMemoryStore } from '../src/memory/local-store';
import { SimpleSummarizer } from '../src/memory/summarizer';

function message(id: string, content: string, createdAt = Date.now()): Message {
  return {
    id,
    role: 'user',
    content,
    createdAt,
  };
}

describe('SimpleSummarizer', () => {
  it('creates deterministic summaries and trims long summaries', async () => {
    const summarizer = new SimpleSummarizer({ maxSummaryCharacters: 24 });

    await expect(
      summarizer.summarize([
        message('m1', 'alpha project detail'),
        { ...message('m2', 'assistant answer'), role: 'assistant' },
      ]),
    ).resolves.toBe('user: alpha project det...');
  });
});

describe('ContextBuilder', () => {
  it('builds context in the documented order', async () => {
    const store = new InMemoryStore();
    const builder = new ContextBuilder({
      systemPrompt: 'System prompt',
      recentLimit: 1,
      searchTopK: 1,
      summarizer: new SimpleSummarizer({ maxSummaryCharacters: 80 }),
    });
    const input = message('m3', 'alpha current');

    await store.save('s1', message('m1', 'alpha older', 1));
    await store.save('s1', message('m2', 'recent only', 2));

    const context = await builder.build(store, 's1', input);

    expect(context).toMatchObject([
      { role: 'system', content: 'System prompt' },
      { role: 'system', content: expect.stringContaining('Conversation summary:') },
      { id: 'm1', content: 'alpha older' },
      { id: 'm2', content: 'recent only' },
      { id: 'm3', content: 'alpha current' },
    ]);
  });

  it('deduplicates current input and trims context characters', async () => {
    const store = new InMemoryStore();
    const input = message('m2', 'current input');
    const builder = new ContextBuilder({
      systemPrompt: 'System prompt',
      recentLimit: 5,
      searchTopK: 5,
      maxContextCharacters: 35,
    });

    await store.save('s1', message('m1', 'very long older message'));
    await store.save('s1', input);

    const context = await builder.build(store, 's1', input);

    expect(context.filter((item) => item.id === 'm2')).toHaveLength(1);
    expect(context.at(-1)).toMatchObject({ id: 'm2', content: 'current input' });
    expect(context.map((item) => item.content).join('').length).toBeLessThanOrEqual(
      35,
    );
  });
});

describe('InMemoryStore with ContextBuilder', () => {
  it('can delegate context assembly to a custom builder', async () => {
    const store = new InMemoryStore(
      new ContextBuilder({
        systemPrompt: 'Custom system',
        recentLimit: 0,
        searchTopK: 0,
      }),
    );

    const context = await store.buildContext('s1', message('m1', 'hello'));

    expect(context).toMatchObject([
      { role: 'system', content: 'Custom system' },
      { id: 'm1', content: 'hello' },
    ]);
  });
});
