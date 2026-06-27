import path from 'node:path';

export function validateSandboxPath(baseDir: string, targetPath: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, targetPath);

  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error(`Path escapes sandbox: ${targetPath}`);
  }

  return target;
}
