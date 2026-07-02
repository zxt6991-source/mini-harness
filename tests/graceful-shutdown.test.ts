import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdownController } from '../src';

describe('GracefulShutdownController', () => {
  it('waits for tracked operations before shutdown resolves', async () => {
    const controller = createGracefulShutdownController();
    let completeOperation!: () => void;
    const operation = controller.track(
      new Promise<void>((resolve) => {
        completeOperation = resolve;
      }),
    );

    const shutdown = controller.shutdown();
    expect(controller.activeCount()).toBe(1);

    completeOperation();
    await operation;
    await shutdown;

    expect(controller.activeCount()).toBe(0);
  });

  it('invokes onTimeout when operations do not finish in time', async () => {
    const onTimeout = vi.fn();
    const controller = createGracefulShutdownController({
      timeoutMs: 1,
      onTimeout,
    });
    controller.track(new Promise<void>(() => {})).catch(() => undefined);

    await controller.shutdown();

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(controller.activeCount()).toBe(1);
  });
});
