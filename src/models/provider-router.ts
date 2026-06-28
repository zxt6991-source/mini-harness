// 该文件提供多模型 Provider 路由，按顺序尝试可用 provider 并记录健康状态。
import type { ModelChatInput, ModelChatOutput, ModelProvider } from '../core';
import { ModelProviderError } from '../core';
import { CircuitBreaker } from './circuit-breaker';

export interface ProviderRouterOptions {
  providers: ModelProvider[];
  failureThreshold: number;
  resetTimeoutMs: number;
}

/** 实现 ModelProvider 接口的路由器，可作为 Engine 的透明模型提供方。 */
export class ProviderRouter implements ModelProvider {
  name = 'provider-router';

  private readonly breakers: Map<string, CircuitBreaker>;

  constructor(private readonly options: ProviderRouterOptions) {
    this.breakers = new Map(
      options.providers.map((provider) => [
        provider.name,
        new CircuitBreaker(options.failureThreshold, options.resetTimeoutMs),
      ]),
    );
  }

  /** 按配置顺序调用 provider，失败时透明尝试下一项。 */
  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const errors: unknown[] = [];

    for (const provider of this.options.providers) {
      const breaker = this.breakers.get(provider.name);
      if (!breaker?.isAvailable()) {
        continue;
      }

      try {
        const output = await provider.chat({
          ...input,
          metadata: {
            ...input.metadata,
            routedProvider: provider.name,
          },
        });
        breaker.recordSuccess();
        return output;
      } catch (error) {
        breaker.recordFailure();
        errors.push(error);
      }
    }

    throw new ModelProviderError('All model providers failed', 'MODEL_ROUTER_EXHAUSTED', {
      retryable: true,
      cause: errors,
    });
  }
}
