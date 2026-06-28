import { describe, expect, it } from 'vitest';
import { ContextCache } from '../src/memory/context-cache';

describe('ContextCache', () => {
  it('returns cached values until ttl expires and supports tag invalidation', () => {
    let now = 1000;
    const cache = new ContextCache<string>({ now: () => now, ttlMs: 100 });

    cache.set('user:1', 'cached profile', ['user']);
    expect(cache.get('user:1')).toBe('cached profile');

    now = 1050;
    expect(cache.get('user:1')).toBe('cached profile');

    cache.invalidateByTag('user');
    expect(cache.get('user:1')).toBeUndefined();

    cache.set('project:1', 'cached project', ['project']);
    now = 1201;
    expect(cache.get('project:1')).toBeUndefined();
  });
});
