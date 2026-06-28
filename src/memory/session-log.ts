// 该文件提供 JSONL 会话日志，保留原始消息以支持后续记忆整合和审计。
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Message } from '../core';

export interface SessionLogStoreOptions {
  rootDir: string;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

export class SessionLogStore {
  constructor(private readonly options: SessionLogStoreOptions) {}

  async append(sessionId: string, message: Message): Promise<void> {
    await mkdir(this.options.rootDir, { recursive: true });
    await appendFile(
      this.pathFor(sessionId),
      `${JSON.stringify(message)}\n`,
      'utf8',
    );
  }

  async readRecent(sessionId: string, limit: number): Promise<Message[]> {
    let raw: string;

    try {
      raw = await readFile(this.pathFor(sessionId), 'utf8');
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }

      throw error;
    }

    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Message)
      .slice(-limit);
  }

  private pathFor(sessionId: string): string {
    return join(this.options.rootDir, `${sanitizeFilePart(sessionId)}.jsonl`);
  }
}
