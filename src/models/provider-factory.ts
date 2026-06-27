import type { ModelProvider } from '../core';
import type { HarnessConfig } from '../utils/config';
import { ChatCompletionsProvider } from './chat-completions-provider';
import { MockProvider } from './mock-provider';
import { OpenAIProvider } from './openai-provider';

export function createModelProvider(config: HarnessConfig): ModelProvider {
  switch (config.model.provider) {
    case 'mock':
      return new MockProvider();
    case 'openai':
      return new OpenAIProvider({
        model: config.model.openai.model,
        baseUrl: config.model.openai.baseUrl,
        apiKey: process.env[config.model.openai.apiKeyEnv],
        defaultTimeoutMs: config.runtime.requestTimeoutMs,
      });
    case 'deepseek':
      return new ChatCompletionsProvider({
        name: 'deepseek',
        model: config.model.deepseek.model,
        baseUrl: config.model.deepseek.baseUrl,
        apiKeyEnv: config.model.deepseek.apiKeyEnv,
        defaultTimeoutMs: config.runtime.requestTimeoutMs,
      });
  }
}
