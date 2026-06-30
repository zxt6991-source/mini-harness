// 该文件提供运行时重试策略，用于模型调用等可恢复操作的指数退避。
export interface RetryPolicyOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  jitterRatio?: number;
}

export const defaultRetryPolicy: Required<RetryPolicyOptions> = {
  maxRetries: 0,
  initialBackoffMs: 250,
  maxBackoffMs: 2_000,
  jitterRatio: 0,
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
    jitterRatio: Math.max(
      0,
      options?.jitterRatio ?? defaultRetryPolicy.jitterRatio,
    ),
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
  random: () => number = Math.random,
): number {
  const baseDelay = Math.min(
    policy.initialBackoffMs * 2 ** Math.max(0, attempt - 1),
    policy.maxBackoffMs,
  );

  if (baseDelay <= 0 || policy.jitterRatio <= 0) {
    return baseDelay;
  }

  const jitter = random() * baseDelay * policy.jitterRatio;
  return Math.min(baseDelay + jitter, policy.maxBackoffMs);
}

/** 使用 Promise 级超时包装异步操作，供模型、工具或外部调用复用。 */
export async function runWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number | undefined,
  createError: () => Error = () =>
    new Error(`Operation timed out after ${timeoutMs ?? 0}ms`),
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return operation();
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(createError());
    }, timeoutMs);

    operation()
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
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
