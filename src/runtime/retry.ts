// 该文件提供运行时重试策略，用于模型调用等可恢复操作的指数退避。
export interface RetryPolicyOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export const defaultRetryPolicy: Required<RetryPolicyOptions> = {
  maxRetries: 0,
  initialBackoffMs: 250,
  maxBackoffMs: 2_000,
};

/** 等待指定毫秒数，供重试退避使用。 */
export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** 归一化重试策略，补齐未显式配置的默认值。 */
export function resolveRetryPolicy(
  options: RetryPolicyOptions | undefined,
): Required<RetryPolicyOptions> {
  return {
    maxRetries: options?.maxRetries ?? defaultRetryPolicy.maxRetries,
    initialBackoffMs:
      options?.initialBackoffMs ?? defaultRetryPolicy.initialBackoffMs,
    maxBackoffMs: options?.maxBackoffMs ?? defaultRetryPolicy.maxBackoffMs,
  };
}

/** 判断错误对象是否声明为可重试。 */
export function isRetryableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    error.retryable === true
  );
}

/** 根据当前失败次数计算指数退避等待时间。 */
export function getRetryDelayMs(
  attempt: number,
  policy: Required<RetryPolicyOptions>,
): number {
  const delay = policy.initialBackoffMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, policy.maxBackoffMs);
}

/** 使用给定重试策略执行异步操作，直到成功或达到重试上限。 */
export async function runWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryPolicyOptions = {},
): Promise<T> {
  const policy = resolveRetryPolicy(options);

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableError(error) || attempt > policy.maxRetries) {
        throw error;
      }

      await sleep(getRetryDelayMs(attempt, policy));
    }
  }
}
