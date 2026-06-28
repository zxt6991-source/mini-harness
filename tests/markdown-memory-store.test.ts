import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { MemoryVersionConflictError } from '../src/memory/entry-store';
import { MarkdownMemoryStore } from '../src/memory/markdown-store';
import type { MemoryEntry } from '../src/memory/types';

function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem_alpha',
    type: 'project',
    content: 'Alpha project memory',
    tags: ['alpha'],
    confidence: 0.9,
    version: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('MarkdownMemoryStore', () => {
  it('saves, reads, lists, and searches memory entries by type', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-memory-'));
    const store = new MarkdownMemoryStore({ rootDir, now: () => 2000 });

    await store.save(entry());

    await expect(store.get('mem_alpha')).resolves.toMatchObject({
      id: 'mem_alpha',
      type: 'project',
      version: 1,
      content: 'Alpha project memory',
    });
    await expect(store.list({ types: ['project'] })).resolves.toMatchObject([
      { id: 'mem_alpha' },
    ]);
    await expect(
      store.search({ query: 'alpha', topK: 3, types: ['project'] }),
    ).resolves.toMatchObject([
      {
        entry: { id: 'mem_alpha' },
        score: expect.any(Number),
        reasons: expect.arrayContaining(['keyword:alpha']),
      },
    ]);

    const raw = await readFile(
      join(rootDir, 'by_type', 'project', 'mem_alpha.md'),
      'utf8',
    );
    expect(raw).toContain('type: project');
  });

  it('enforces expected version on update', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-memory-'));
    const store = new MarkdownMemoryStore({ rootDir, now: () => 3000 });

    await store.save(entry());
    await expect(
      store.save(
        entry({ content: 'Updated memory', version: 1 }),
        { expectedVersion: 99 },
      ),
    ).rejects.toBeInstanceOf(MemoryVersionConflictError);

    await store.save(entry({ content: 'Updated memory', version: 1 }), {
      expectedVersion: 1,
    });

    await expect(store.get('mem_alpha')).resolves.toMatchObject({
      content: 'Updated memory',
      version: 2,
      updatedAt: 3000,
    });
  });

  it('filters expired and low-confidence entries during search', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'mh-memory-'));
    const store = new MarkdownMemoryStore({ rootDir, now: () => 5000 });

    await store.save(entry({ id: 'mem_live', content: 'stable alpha' }));
    await store.save(
      entry({
        id: 'mem_expired',
        content: 'expired alpha',
        expiryAt: 4000,
      }),
    );
    await store.save(
      entry({
        id: 'mem_weak',
        content: 'weak alpha',
        confidence: 0.2,
      }),
    );

    const hits = await store.search({
      query: 'alpha',
      topK: 10,
      minConfidence: 0.5,
      now: 5000,
    });

    expect(hits.map((hit) => hit.entry.id)).toEqual(['mem_live']);
  });
});
