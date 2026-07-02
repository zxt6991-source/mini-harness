// 该文件实现工具 JSON Schema 的稳定 hash 与进程内缓存统计。
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface ToolSchemaCacheOptions {
  maxEntries?: number;
}

export interface PersistentToolSchemaCacheOptions extends ToolSchemaCacheOptions {
  rootDir: string;
  fileName?: string;
}

export interface ToolSchemaCacheEntry {
  hash: string;
  schema: unknown;
  schemaJson: string;
  characters: number;
  hits: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface ToolSchemaCacheStats {
  entries: number;
  hits: number;
  totalSchemaCharacters: number;
  maxEntries: number;
}

export interface ToolSchemaCacheSnapshot {
  entries: ToolSchemaCacheEntry[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function hashSchema(schemaJson: string): string {
  return createHash('sha256').update(schemaJson).digest('hex').slice(0, 16);
}

export class ToolSchemaCache {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, ToolSchemaCacheEntry>();

  constructor(options: ToolSchemaCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1_000;
  }

  remember(schema: unknown): ToolSchemaCacheEntry {
    const schemaJson = stableStringify(schema);
    const hash = hashSchema(schemaJson);
    const now = Date.now();
    const existing = this.entries.get(hash);

    if (existing) {
      existing.hits++;
      existing.lastSeenAt = now;
      return existing;
    }

    const entry: ToolSchemaCacheEntry = {
      hash,
      schema,
      schemaJson,
      characters: schemaJson.length,
      hits: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    };

    this.entries.set(hash, entry);
    this.evictOverflow();
    return entry;
  }

  get(hash: string): ToolSchemaCacheEntry | undefined {
    return this.entries.get(hash);
  }

  stats(): ToolSchemaCacheStats {
    const values = [...this.entries.values()];

    return {
      entries: values.length,
      hits: values.reduce((total, entry) => total + entry.hits, 0),
      totalSchemaCharacters: values.reduce(
        (total, entry) => total + entry.characters,
        0,
      ),
      maxEntries: this.maxEntries,
    };
  }

  snapshot(): ToolSchemaCacheSnapshot {
    return {
      entries: [...this.entries.values()].map((entry) => ({ ...entry })),
    };
  }

  hydrate(snapshot: ToolSchemaCacheSnapshot): void {
    this.entries.clear();

    const sorted = [...snapshot.entries].sort(
      (left, right) =>
        right.lastSeenAt - left.lastSeenAt || right.firstSeenAt - left.firstSeenAt,
    );

    for (const entry of sorted.slice(0, this.maxEntries)) {
      this.entries.set(entry.hash, { ...entry });
    }
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = [...this.entries.values()].sort(
        (left, right) =>
          left.lastSeenAt - right.lastSeenAt || left.firstSeenAt - right.firstSeenAt,
      )[0];

      if (!oldest) {
        return;
      }

      this.entries.delete(oldest.hash);
    }
  }
}

/** 文件持久化 schema cache，适合工具 schema 注册后的重启恢复。 */
export class PersistentToolSchemaCache extends ToolSchemaCache {
  private readonly snapshotPath: string;

  constructor(private readonly persistentOptions: PersistentToolSchemaCacheOptions) {
    super(persistentOptions);
    this.snapshotPath = join(
      persistentOptions.rootDir,
      persistentOptions.fileName ?? 'tool-schema-cache.json',
    );
    this.loadSnapshot();
  }

  override remember(schema: unknown): ToolSchemaCacheEntry {
    const entry = super.remember(schema);
    this.saveSnapshot();
    return entry;
  }

  private loadSnapshot(): void {
    if (!existsSync(this.snapshotPath)) {
      return;
    }

    this.hydrate(JSON.parse(readFileSync(this.snapshotPath, 'utf8')) as ToolSchemaCacheSnapshot);
  }

  private saveSnapshot(): void {
    mkdirSync(this.persistentOptions.rootDir, { recursive: true });
    const tempPath = `${this.snapshotPath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.snapshot(), null, 2), 'utf8');
    renameSync(tempPath, this.snapshotPath);
  }
}
