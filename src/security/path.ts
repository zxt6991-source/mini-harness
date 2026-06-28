// 该文件提供沙箱路径校验工具，确保目标路径不会逃逸指定基础目录。
import path from 'node:path';

/** 解析并校验目标路径必须位于沙箱基础目录内，返回规范化后的绝对路径。 */
export function validateSandboxPath(baseDir: string, targetPath: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(baseDir, targetPath);

  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error(`Path escapes sandbox: ${targetPath}`);
  }

  return target;
}
