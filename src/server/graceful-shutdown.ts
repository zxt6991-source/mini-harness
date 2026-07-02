// 该文件提供服务入口可复用的优雅关闭控制器。
import type { Server } from 'node:http';

export interface GracefulShutdownControllerOptions {
  server?: Server;
  timeoutMs?: number;
  onTimeout?: () => void | Promise<void>;
}

export interface GracefulShutdownController {
  track<T>(operation: Promise<T>): Promise<T>;
  shutdown(): Promise<void>;
  activeCount(): number;
}

function closeServer(server: Server | undefined): Promise<void> {
  if (!server || !server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function sleep(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => {
    setTimeout(() => resolve('timeout'), ms);
  });
}

/** 创建优雅关闭控制器，用于停止接收请求并等待运行中任务收尾。 */
export function createGracefulShutdownController(
  options: GracefulShutdownControllerOptions = {},
): GracefulShutdownController {
  const active = new Set<Promise<unknown>>();
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    track<T>(operation: Promise<T>): Promise<T> {
      const tracked = operation.finally(() => {
        active.delete(tracked);
      });
      active.add(tracked);
      return tracked;
    },

    async shutdown(): Promise<void> {
      await closeServer(options.server);

      if (active.size === 0) {
        return;
      }

      const completed = Promise.allSettled([...active]).then(() => 'completed' as const);
      const result = await Promise.race([completed, sleep(timeoutMs)]);

      if (result === 'timeout') {
        await options.onTimeout?.();
      }
    },

    activeCount(): number {
      return active.size;
    },
  };
}
