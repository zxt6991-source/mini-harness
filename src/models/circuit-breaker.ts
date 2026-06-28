// 该文件实现模型 Provider 路由使用的三态熔断器。
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** 基于失败次数和恢复窗口管理 provider 可用性。 */
export class CircuitBreaker {
  private failureCount = 0;
  private openedAt = 0;
  private stateValue: CircuitBreakerState = 'closed';

  constructor(
    private readonly failureThreshold: number,
    private readonly resetTimeoutMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): CircuitBreakerState {
    return this.stateValue;
  }

  /** 返回当前 provider 是否允许尝试调用。 */
  isAvailable(): boolean {
    if (this.stateValue === 'closed' || this.stateValue === 'half-open') {
      return true;
    }

    if (this.now() - this.openedAt >= this.resetTimeoutMs) {
      this.stateValue = 'half-open';
      return true;
    }

    return false;
  }

  /** 成功调用后关闭熔断器并清空失败计数。 */
  recordSuccess(): void {
    this.failureCount = 0;
    this.stateValue = 'closed';
  }

  /** 失败达到阈值后打开熔断器。 */
  recordFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.failureThreshold) {
      this.stateValue = 'open';
      this.openedAt = this.now();
    }
  }
}
