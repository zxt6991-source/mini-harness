import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatCompletionsProvider } from '../src/models/chat-completions-provider';
import { MockProvider } from '../src/models/mock-provider';
import { OpenAIProvider } from '../src/models/openai-provider';
import { createModelProvider } from '../src/models/provider-factory';
import { loadEnvFile, loadHarnessConfig } from '../src/utils/config';

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
      memory: {
        type: 'local',
        rootDir: '.miniharness/memory',
        consolidation: {
          enabled: true,
        },
      },
    });
    expect(createModelProvider(config)).toBeInstanceOf(MockProvider);
  });

  it('creates DeepSeek chat completions providers from config', () => {
    const provider = createModelProvider({
      runtime: {
        maxSteps: 4,
        requestTimeoutMs: 1000,
        toolTimeoutMs: 30000,
        enableStream: false,
        maxConcurrentTools: 1,
        toolErrorMode: 'throw',
        modelRetry: {
          maxRetries: 0,
          initialBackoffMs: 250,
          maxBackoffMs: 2000,
        },
        budget: {
          maxModelCalls: 20,
          maxEstimatedTokens: 1000000,
          maxContextCharacters: 120000,
          reserveOutputTokens: 4000,
        },
        drift: {
          maxToolCalls: 50,
          repeatedToolWindow: 6,
          repeatedToolThreshold: 1000000,
          reflectionInterval: 0,
        },
      },
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
      runtime: {
        maxSteps: 4,
        requestTimeoutMs: 1000,
        toolTimeoutMs: 30000,
        enableStream: false,
        maxConcurrentTools: 1,
        toolErrorMode: 'throw',
        modelRetry: {
          maxRetries: 0,
          initialBackoffMs: 250,
          maxBackoffMs: 2000,
        },
        budget: {
          maxModelCalls: 20,
          maxEstimatedTokens: 1000000,
          maxContextCharacters: 120000,
          reserveOutputTokens: 4000,
        },
        drift: {
          maxToolCalls: 50,
          repeatedToolWindow: 6,
          repeatedToolThreshold: 1000000,
          reflectionInterval: 0,
        },
      },
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

  it('loads environment variables from .env files without overriding existing values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-env-'));
    const envPath = join(dir, '.env');
    const previousDeepSeek = process.env.DEEPSEEK_API_KEY;
    const previousExisting = process.env.MINIHARNESS_EXISTING_ENV;
    const previousQuoted = process.env.MINIHARNESS_QUOTED_ENV;
    const previousSingleQuoted = process.env.MINIHARNESS_SINGLE_QUOTED_ENV;
    const previousInline = process.env.MINIHARNESS_INLINE_ENV;

    await writeFile(
      envPath,
      `
# comments and blank lines are ignored
DEEPSEEK_API_KEY=from-dotenv
MINIHARNESS_EXISTING_ENV=from-dotenv
MINIHARNESS_QUOTED_ENV="quoted value"
export MINIHARNESS_SINGLE_QUOTED_ENV='single quoted value'
MINIHARNESS_INLINE_ENV=plain-value # trailing comments are ignored
`,
    );

    try {
      delete process.env.DEEPSEEK_API_KEY;
      process.env.MINIHARNESS_EXISTING_ENV = 'from-shell';
      delete process.env.MINIHARNESS_QUOTED_ENV;
      delete process.env.MINIHARNESS_SINGLE_QUOTED_ENV;
      delete process.env.MINIHARNESS_INLINE_ENV;

      await loadEnvFile(envPath);

      expect(process.env.DEEPSEEK_API_KEY).toBe('from-dotenv');
      expect(process.env.MINIHARNESS_EXISTING_ENV).toBe('from-shell');
      expect(process.env.MINIHARNESS_QUOTED_ENV).toBe('quoted value');
      expect(process.env.MINIHARNESS_SINGLE_QUOTED_ENV).toBe('single quoted value');
      expect(process.env.MINIHARNESS_INLINE_ENV).toBe('plain-value');
    } finally {
      restoreEnv('DEEPSEEK_API_KEY', previousDeepSeek);
      restoreEnv('MINIHARNESS_EXISTING_ENV', previousExisting);
      restoreEnv('MINIHARNESS_QUOTED_ENV', previousQuoted);
      restoreEnv('MINIHARNESS_SINGLE_QUOTED_ENV', previousSingleQuoted);
      restoreEnv('MINIHARNESS_INLINE_ENV', previousInline);
    }
  });

  it('loads .env before parsing harness config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'miniharness-config-env-'));
    const configPath = join(dir, 'harness.yaml');
    const envPath = join(dir, '.env');
    const previousDeepSeek = process.env.DEEPSEEK_API_KEY;

    await writeFile(
      configPath,
      `
runtime:
  maxSteps: 4
  requestTimeoutMs: 1000
model:
  provider: deepseek
`,
    );
    await writeFile(envPath, 'DEEPSEEK_API_KEY=from-config-dotenv\n');

    try {
      delete process.env.DEEPSEEK_API_KEY;

      const config = await loadHarnessConfig(configPath, { envPath });
      const provider = createModelProvider(config);

      expect(provider).toBeInstanceOf(ChatCompletionsProvider);
      expect(process.env.DEEPSEEK_API_KEY).toBe('from-config-dotenv');
    } finally {
      restoreEnv('DEEPSEEK_API_KEY', previousDeepSeek);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
