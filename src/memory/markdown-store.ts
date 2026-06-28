// 该文件实现基于 Markdown frontmatter 的长期记忆条目持久化存储。
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseMemoryFrontmatter, stringifyMemoryFrontmatter } from './frontmatter';
import {
  MemoryVersionConflictError,
  type MemoryEntryListOptions,
  type MemoryEntrySaveOptions,
  type MemoryEntryStore,
} from './entry-store';
import type {
  MemoryEntry,
  MemoryEntryType,
  MemorySearchHit,
  MemorySearchQuery,
} from './types';

export interface MarkdownMemoryStoreOptions {
  rootDir: string;
  now?: () => number;
}

const MEMORY_TYPES: MemoryEntryType[] = [
  'user',
  'feedback',
  'project',
  'reference',
  'episodic',
  'lesson',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isExpired(entry: MemoryEntry, now: number): boolean {
  return entry.expiryAt !== undefined && entry.expiryAt <= now;
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

export class MarkdownMemoryStore implements MemoryEntryStore {
  private readonly now: () => number;

  constructor(private readonly options: MarkdownMemoryStoreOptions) {
    this.now = options.now ?? Date.now;
  }

  async save(
    entry: MemoryEntry,
    options: MemoryEntrySaveOptions = {},
  ): Promise<MemoryEntry> {
    const existing = await this.get(entry.id);

    if (
      options.expectedVersion !== undefined &&
      existing?.version !== options.expectedVersion
    ) {
      throw new MemoryVersionConflictError(
        entry.id,
        options.expectedVersion,
        existing?.version ?? 0,
      );
    }

    const saved: MemoryEntry = existing
      ? {
          ...entry,
          createdAt: existing.createdAt,
          version: existing.version + 1,
          updatedAt: this.now(),
        }
      : entry;

    await this.ensureTypeDir(saved.type);
    const targetPath = this.entryPath(saved.type, saved.id);
    const tempPath = `${targetPath}.${process.pid}.tmp`;

    await writeFile(tempPath, stringifyMemoryFrontmatter(saved), 'utf8');
    await rename(tempPath, targetPath);

    if (existing && existing.type !== saved.type) {
      await rm(this.entryPath(existing.type, existing.id), { force: true });
    }

    return saved;
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    for (const type of MEMORY_TYPES) {
      try {
        return parseMemoryFrontmatter(
          await readFile(this.entryPath(type, id), 'utf8'),
        );
      } catch (error) {
        if (isMissingFile(error)) {
          continue;
        }

        throw error;
      }
    }

    return undefined;
  }

  async list(options: MemoryEntryListOptions = {}): Promise<MemoryEntry[]> {
    const types = options.types ?? MEMORY_TYPES;
    const now = options.now ?? this.now();
    const entries: MemoryEntry[] = [];

    for (const type of types) {
      let files: string[];
      try {
        files = await readdir(this.typeDir(type));
      } catch (error) {
        if (isMissingFile(error)) {
          continue;
        }

        throw error;
      }

      for (const file of files.sort()) {
        if (!file.endsWith('.md')) {
          continue;
        }

        const entry = parseMemoryFrontmatter(
          await readFile(join(this.typeDir(type), file), 'utf8'),
        );

        if (!options.includeExpired && isExpired(entry, now)) {
          continue;
        }

        entries.push(entry);
      }
    }

    return entries.sort((left, right) => left.updatedAt - right.updatedAt);
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchHit[]> {
    const queryTokens = tokenize(query.query);
    const now = query.now ?? this.now();
    const entries = await this.list({
      types: query.types,
      now,
      includeExpired: false,
    });
    const hits: MemorySearchHit[] = [];

    for (const entry of entries) {
      if (query.minConfidence !== undefined && entry.confidence < query.minConfidence) {
        continue;
      }

      if (
        query.tags &&
        query.tags.length > 0 &&
        !query.tags.some((tag) => entry.tags.includes(tag))
      ) {
        continue;
      }

      const haystack = tokenize(
        `${entry.id} ${entry.type} ${entry.tags.join(' ')} ${entry.content}`,
      );
      const reasons: string[] = [];
      let score = entry.confidence;

      for (const token of queryTokens) {
        if (haystack.includes(token)) {
          score += 1;
          reasons.push(`keyword:${token}`);
        }
      }

      if (queryTokens.length === 0 || reasons.length > 0) {
        hits.push({ entry, score, reasons });
      }
    }

    return hits
      .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
      .slice(0, query.topK);
  }

  async delete(id: string): Promise<boolean> {
    const entry = await this.get(id);

    if (!entry) {
      return false;
    }

    await rm(this.entryPath(entry.type, id), { force: true });
    return true;
  }

  private typeDir(type: MemoryEntryType): string {
    return join(this.options.rootDir, 'by_type', type);
  }

  private entryPath(type: MemoryEntryType, id: string): string {
    return join(this.typeDir(type), `${sanitizeFilePart(id)}.md`);
  }

  private async ensureTypeDir(type: MemoryEntryType): Promise<void> {
    await mkdir(this.typeDir(type), { recursive: true });
  }
}
