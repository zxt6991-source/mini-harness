import { describe, expect, it } from 'vitest';
import { ToolSchemaCache } from '../src/production/schema-cache';
import { EchoTool } from '../src/tools/builtin/echo';
import { DefaultToolRegistry } from '../src/tools/registry';

describe('ToolSchemaCache', () => {
  it('hashes equivalent schemas deterministically and records hits', () => {
    const cache = new ToolSchemaCache();

    const first = cache.remember({
      type: 'object',
      required: ['text'],
      properties: { text: { type: 'string' } },
    });
    const second = cache.remember({
      properties: { text: { type: 'string' } },
      required: ['text'],
      type: 'object',
    });

    expect(second.hash).toBe(first.hash);
    expect(cache.get(first.hash)).toMatchObject({
      hash: first.hash,
      hits: 2,
    });
    expect(cache.stats()).toMatchObject({
      entries: 1,
      hits: 2,
    });
  });

  it('evicts the least recently seen schema when maxEntries is exceeded', () => {
    const cache = new ToolSchemaCache({ maxEntries: 2 });
    const first = cache.remember({ type: 'object', title: 'first' });

    cache.remember({ type: 'object', title: 'second' });
    cache.remember({ type: 'object', title: 'third' });

    expect(cache.stats().entries).toBe(2);
    expect(cache.get(first.hash)).toBeUndefined();
  });
});

describe('DefaultToolRegistry schema cache integration', () => {
  it('adds schema cache metadata to tool capabilities without changing tool list', () => {
    const schemaCache = new ToolSchemaCache();
    const registry = new DefaultToolRegistry(undefined, { schemaCache });
    const tool = new EchoTool();

    registry.register(tool);

    expect(registry.list()).toEqual([tool]);
    expect(registry.getCapability('echo')?.metadata).toMatchObject({
      schemaHash: expect.stringMatching(/^[a-f0-9]{16}$/),
      schemaCharacters: expect.any(Number),
    });
    expect(registry.getSchemaCacheStats()).toMatchObject({
      entries: 1,
      hits: 1,
    });
  });
});
