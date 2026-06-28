// 该文件提供上下文组装用的 TTL 缓存，并支持按标签批量失效。
export interface ContextCacheOptions {
  ttlMs: number;
  now?: () => number;
}

interface ContextCacheEntry<T> {
  value: T;
  createdAt: number;
  tags: string[];
}

export class ContextCache<T> {
  private readonly now: () => number;
  private readonly entries = new Map<string, ContextCacheEntry<T>>();

  constructor(private readonly options: ContextCacheOptions) {
    this.now = options.now ?? Date.now;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (this.now() - entry.createdAt > this.options.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, tags: string[] = []): void {
    this.entries.set(key, {
      value,
      tags,
      createdAt: this.now(),
    });
  }

  invalidateByTag(tag: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.tags.includes(tag)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
