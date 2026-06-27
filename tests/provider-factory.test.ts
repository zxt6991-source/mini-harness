import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatCompletionsProvider } from '../src/models/chat-completions-provider';
import { MockProvider } from '../src/models/mock-provider';
import { OpenAIProvider } from '../src/models/openai-provider';
import { createModelProvider } from '../src/models/provider-factory';
import { loadHarnessConfig } from '../src/utils/config';

describe('provider factory', () => {
  it('loads harness config defaults and creates mock providers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-config-'));
    const configPath = join(dir, 'harness.yaml');
    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
model:
  provider: mock
`,
    );

    const config = await loadHarnessConfig(configPath);

    expect(config).toMatchObject({
      runtime: {
        maxSteps: 4,
        requestTimeoutMs: 1000,
        enableStream: false,
      },
      model: {
        provider: 'mock',
      },
    });
    expect(createModelProvider(config)).toBeInstanceOf(MockProvider);
  });

  it('creates DeepSeek chat completions providers from config', () => {
    const provider = createModelProvider({
      runtime: { maxSteps: 4, requestTimeoutMs: 1000, enableStream: false },
      model: {
        provider: 'deepseek',
        temperature: 0.2,
        maxTokens: 64,
        openai: {
          model: 'gpt-test',
          apiKeyEnv: 'OPENAI_API_KEY',
          baseUrl: 'https://api.openai.com/v1',
        },
        deepseek: {
          model: 'deepseek-test',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    });

    expect(provider).toBeInstanceOf(ChatCompletionsProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('creates OpenAI providers from config', () => {
    const provider = createModelProvider({
      runtime: { maxSteps: 4, requestTimeoutMs: 1000, enableStream: false },
      model: {
        provider: 'openai',
        temperature: 0.2,
        maxTokens: 64,
        openai: {
          model: 'gpt-test',
          apiKeyEnv: 'OPENAI_API_KEY',
          baseUrl: 'https://api.openai.com/v1',
        },
        deepseek: {
          model: 'deepseek-test',
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          baseUrl: 'https://api.deepseek.com',
        },
      },
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});
