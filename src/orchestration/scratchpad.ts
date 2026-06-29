// 该文件实现编排 scratchpad，用于在任务和 agent 间共享受控状态。
export interface ScratchpadEntry {
  key: string;
  value: unknown;
  version: number;
  writerId: string;
  createdAt: number;
  updatedAt: number;
  readOnly?: boolean;
}

export interface ScratchpadSnapshot {
  entries: ScratchpadEntry[];
}

export interface ScratchpadPutOptions {
  readOnly?: boolean;
}

export interface ScratchpadAccessLogEntry {
  timestamp: number;
  operation: 'put' | 'get' | 'batch_get' | 'delete';
  key?: string;
  keys?: string[];
  actorId: string;
  version?: number;
}

/** 单进程 scratchpad，记录版本和访问日志。 */
export class Scratchpad {
  private readonly entries = new Map<string, ScratchpadEntry>();
  private readonly accessLog: ScratchpadAccessLogEntry[] = [];
  private readonly now: () => number;

  /** 初始化 scratchpad，可注入时间源以便测试。 */
  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  /** 从 snapshot 恢复 scratchpad。 */
  static fromSnapshot(snapshot: ScratchpadSnapshot): Scratchpad {
    const scratchpad = new Scratchpad();
    for (const entry of snapshot.entries) {
      scratchpad.entries.set(entry.key, { ...entry });
    }

    return scratchpad;
  }

  /** 写入值；已有值版本递增，read-only 值不可覆盖。 */
  put(
    key: string,
    value: unknown,
    writerId: string,
    options: ScratchpadPutOptions = {},
  ): void {
    const current = this.entries.get(key);
    if (current?.readOnly) {
      throw new Error(`Scratchpad entry ${key} is read-only`);
    }

    const now = this.now();
    const entry: ScratchpadEntry = {
      key,
      value,
      writerId,
      version: current ? current.version + 1 : 0,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      readOnly: options.readOnly,
    };

    this.entries.set(key, entry);
    this.accessLog.push({
      timestamp: now,
      operation: 'put',
      key,
      actorId: writerId,
      version: entry.version,
    });
  }

  /** 读取值。 */
  get(key: string, readerId: string, defaultValue?: unknown): unknown {
    const entry = this.entries.get(key);
    this.accessLog.push({
      timestamp: this.now(),
      operation: 'get',
      key,
      actorId: readerId,
      version: entry?.version,
    });

    return entry?.value ?? defaultValue;
  }

  /** 读取完整 entry，用于调试和版本检查。 */
  getEntry(key: string): ScratchpadEntry | undefined {
    const entry = this.entries.get(key);
    return entry ? { ...entry } : undefined;
  }

  /** 批量读取值。 */
  batchGet(keys: string[], readerId: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (this.entries.has(key)) {
        result[key] = this.entries.get(key)?.value;
      }
    }

    this.accessLog.push({
      timestamp: this.now(),
      operation: 'batch_get',
      keys: [...keys],
      actorId: readerId,
    });

    return result;
  }

  /** 删除值；read-only 值不可删除。 */
  delete(key: string, writerId: string): boolean {
    const current = this.entries.get(key);
    if (!current) {
      return false;
    }

    if (current.readOnly) {
      throw new Error(`Scratchpad entry ${key} is read-only`);
    }

    this.entries.delete(key);
    this.accessLog.push({
      timestamp: this.now(),
      operation: 'delete',
      key,
      actorId: writerId,
    });
    return true;
  }

  /** 生成可持久化快照。 */
  snapshot(): ScratchpadSnapshot {
    return {
      entries: Array.from(this.entries.values()).map((entry) => ({ ...entry })),
    };
  }

  /** 返回最近访问日志。 */
  getAccessLog(limit = 100): ScratchpadAccessLogEntry[] {
    return this.accessLog.slice(-limit);
  }
}

