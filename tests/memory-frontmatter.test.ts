import { describe, expect, it } from 'vitest';
import { parseMemoryFrontmatter, stringifyMemoryFrontmatter } from '../src/memory/frontmatter';
import type { MemoryEntry } from '../src/memory/types';

describe('memory frontmatter', () => {
  it('roundtrips memory entries with stable metadata and markdown content', () => {
    const entry: MemoryEntry = {
      id: 'mem_1',
      type: 'project',
      content: 'Project memory content',
      tags: ['memory', 'project'],
      confidence: 0.85,
      version: 2,
      createdAt: 1_782_640_000_000,
      updatedAt: 1_782_640_030_000,
      sourceSessionId: 'session_1',
      sourceMessageIds: ['msg_1', 'msg_2'],
      metadata: { phase: 'one' },
    };

    const serialized = stringifyMemoryFrontmatter(entry);
    const parsed = parseMemoryFrontmatter(serialized);

    expect(serialized).toContain('---\n');
    expect(serialized).toContain('type: project');
    expect(serialized).toContain('# 记忆内容');
    expect(parsed).toEqual(entry);
  });

  it('rejects markdown without memory frontmatter', () => {
    expect(() => parseMemoryFrontmatter('plain markdown')).toThrow(
      /frontmatter/i,
    );
  });
});
