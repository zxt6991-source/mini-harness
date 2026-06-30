// 该文件提供沙箱路径校验工具，确保目标路径不会逃逸指定基础目录。
import fs from 'node:fs';
import path from 'node:path';
import posixPath from 'node:path/posix';

export interface SandboxPathValidationOptions {
  maxPathLength?: number;
}

const DEFAULT_MAX_PATH_LENGTH = 4096;
const MAX_URL_DECODE_ITERATIONS = 20;

/** 解析并校验目标路径必须位于沙箱基础目录内，返回规范化后的绝对路径。 */
export function validateSandboxPath(
  baseDir: string,
  targetPath: string,
  options: SandboxPathValidationOptions = {},
): string {
  const maxPathLength = options.maxPathLength ?? DEFAULT_MAX_PATH_LENGTH;
  if (targetPath.length > maxPathLength) {
    throw new Error(`Path exceeds maximum length: ${targetPath.length}`);
  }

  const base = path.resolve(baseDir);
  const normalizedTarget = normalizeUserPath(targetPath);
  const target = isAbsoluteLikePath(normalizedTarget)
    ? path.resolve(normalizedTarget)
    : path.resolve(base, normalizedTarget);
  const resolvedBase = resolveExistingPath(base);
  const resolvedTarget = resolveExistingPath(target);

  if (!isPathInside(resolvedBase, resolvedTarget)) {
    throw new Error(`Path escapes sandbox: ${targetPath}`);
  }

  return resolvedTarget;
}

function normalizeUserPath(userPath: string): string {
  const decodedPath = decodeAllUrlEncodings(userPath);
  const unicodeNormalized = decodedPath.normalize('NFC').replace(/\\/g, '/');

  if (/^[A-Za-z]:\//.test(unicodeNormalized) || unicodeNormalized.startsWith('//')) {
    throw new Error(`Path escapes sandbox: ${userPath}`);
  }

  return posixPath.normalize(unicodeNormalized);
}

function decodeAllUrlEncodings(userPath: string): string {
  let current = userPath;

  for (let iteration = 0; iteration < MAX_URL_DECODE_ITERATIONS; iteration++) {
    let decoded: string;

    try {
      decoded = decodeURIComponent(current);
    } catch (error) {
      throw new Error(`Invalid path encoding: ${userPath}`);
    }

    if (decoded === current) {
      return decoded;
    }

    current = decoded;
  }

  throw new Error(`Path URL decoding did not converge: ${userPath}`);
}

function resolveExistingPath(target: string): string {
  const absoluteTarget = path.resolve(target);

  if (fs.existsSync(absoluteTarget)) {
    return fs.realpathSync.native(absoluteTarget);
  }

  const missingSegments: string[] = [];
  let current = absoluteTarget;

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    missingSegments.unshift(path.basename(current));

    if (parent === current) {
      return absoluteTarget;
    }

    current = parent;
  }

  return path.resolve(fs.realpathSync.native(current), ...missingSegments);
}

function isAbsoluteLikePath(targetPath: string): boolean {
  return targetPath.startsWith('/');
}

function isPathInside(base: string, target: string): boolean {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
