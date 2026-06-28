// 该文件负责把长期记忆条目序列化为 Markdown frontmatter，并从磁盘内容解析回来。
import { parse, stringify } from 'yaml';
import type { MemoryEntry, MemoryEntryType } from './types';

interface MemoryFrontmatter {
  id: string;
  type: MemoryEntryType;
  version: number;
  confidence: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  expiryAt?: number;
  sourceSessionId?: string;
  sourceMessageIds?: string[];
  metadata?: Record<string, unknown>;
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const CONTENT_HEADING = '# 记忆内容';

function normalizeContent(markdown: string): string {
  const trimmed = markdown.trimStart();

  if (!trimmed.startsWith(CONTENT_HEADING)) {
    return trimmed.trim();
  }

  return trimmed.slice(CONTENT_HEADING.length).trim();
}

function assertMemoryType(value: unknown): asserts value is MemoryEntryType {
  const validTypes = new Set([
    'user',
    'feedback',
    'project',
    'reference',
    'episodic',
    'lesson',
  ]);

  if (typeof value !== 'string' || !validTypes.has(value)) {
    throw new Error(`Invalid memory type: ${String(value)}`);
  }
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid memory frontmatter field: ${field}`);
  }

  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid memory frontmatter field: ${field}`);
  }

  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid memory frontmatter field: ${field}`);
  }

  return value;
}

function toFrontmatter(entry: MemoryEntry): MemoryFrontmatter {
  return {
    id: entry.id,
    type: entry.type,
    version: entry.version,
    confidence: entry.confidence,
    tags: entry.tags,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    ...(entry.lastAccessedAt === undefined ? {} : { lastAccessedAt: entry.lastAccessedAt }),
    ...(entry.expiryAt === undefined ? {} : { expiryAt: entry.expiryAt }),
    ...(entry.sourceSessionId === undefined
      ? {}
      : { sourceSessionId: entry.sourceSessionId }),
    ...(entry.sourceMessageIds === undefined
      ? {}
      : { sourceMessageIds: entry.sourceMessageIds }),
    ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
  };
}

export function stringifyMemoryFrontmatter(entry: MemoryEntry): string {
  return `---\n${stringify(toFrontmatter(entry)).trimEnd()}\n---\n\n${CONTENT_HEADING}\n\n${entry.content.trim()}\n`;
}

export function parseMemoryFrontmatter(markdown: string): MemoryEntry {
  const match = FRONTMATTER_PATTERN.exec(markdown);

  if (!match) {
    throw new Error('Memory markdown is missing YAML frontmatter');
  }

  const metadata = parse(match[1]) as Record<string, unknown>;
  assertMemoryType(metadata.type);

  const tags = metadata.tags;
  if (!Array.isArray(tags) || tags.some((item) => typeof item !== 'string')) {
    throw new Error('Invalid memory frontmatter field: tags');
  }

  const sourceMessageIds = optionalStringArray(
    metadata.sourceMessageIds,
    'sourceMessageIds',
  );

  return {
    id: requireString(metadata.id, 'id'),
    type: metadata.type,
    content: normalizeContent(match[2]),
    tags,
    confidence: requireNumber(metadata.confidence, 'confidence'),
    version: requireNumber(metadata.version, 'version'),
    createdAt: requireNumber(metadata.createdAt, 'createdAt'),
    updatedAt: requireNumber(metadata.updatedAt, 'updatedAt'),
    ...(metadata.lastAccessedAt === undefined
      ? {}
      : { lastAccessedAt: requireNumber(metadata.lastAccessedAt, 'lastAccessedAt') }),
    ...(metadata.expiryAt === undefined
      ? {}
      : { expiryAt: requireNumber(metadata.expiryAt, 'expiryAt') }),
    ...(metadata.sourceSessionId === undefined
      ? {}
      : { sourceSessionId: requireString(metadata.sourceSessionId, 'sourceSessionId') }),
    ...(sourceMessageIds === undefined ? {} : { sourceMessageIds }),
    ...(metadata.metadata === undefined
      ? {}
      : { metadata: metadata.metadata as Record<string, unknown> }),
  };
}
