// 该文件定义长期记忆条目存储接口和写入版本冲突错误。
import type { MemoryEntry, MemoryEntryType, MemorySearchHit, MemorySearchQuery } from './types';

export interface MemoryEntryListOptions {
  types?: MemoryEntryType[];
  includeExpired?: boolean;
  now?: number;
}

export interface MemoryEntrySaveOptions {
  expectedVersion?: number;
}

export interface MemoryEntryStore {
  save(entry: MemoryEntry, options?: MemoryEntrySaveOptions): Promise<MemoryEntry>;
  get(id: string): Promise<MemoryEntry | undefined>;
  list(options?: MemoryEntryListOptions): Promise<MemoryEntry[]>;
  search(query: MemorySearchQuery): Promise<MemorySearchHit[]>;
  delete(id: string): Promise<boolean>;
}

export class MemoryVersionConflictError extends Error {
  readonly code = 'MEMORY_VERSION_CONFLICT';

  constructor(
    readonly memoryId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Memory entry ${memoryId} version conflict: expected ${expectedVersion}, got ${actualVersion}`,
    );
    this.name = 'MemoryVersionConflictError';
  }
}
