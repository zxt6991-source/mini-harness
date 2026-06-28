import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

const providerConfigSchema = z.object({
  model: z.string(),
  apiKeyEnv: z.string(),
  baseUrl: z.string().url(),
});

const runtimeConfigSchema = z
  .object({
    maxSteps: z.number().int().positive().default(8),
    requestTimeoutMs: z.number().int().positive().default(60_000),
    enableStream: z.boolean().default(false),
  })
  .default({
    maxSteps: 8,
    requestTimeoutMs: 60_000,
    enableStream: false,
  });

const modelConfigSchema = z
  .object({
    provider: z.enum(['mock', 'openai', 'deepseek']).default('mock'),
    temperature: z.number().optional(),
    maxTokens: z.number().int().positive().optional(),
    openai: providerConfigSchema.default({
      model: 'gpt-5.5',
      apiKeyEnv: 'OPENAI_API_KEY',
      baseUrl: 'https://api.openai.com/v1',
    }),
    deepseek: providerConfigSchema.default({
      model: 'deepseek-v4-flash',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com',
    }),
  })
  .default({
    provider: 'mock',
    openai: {
      model: 'gpt-5.5',
      apiKeyEnv: 'OPENAI_API_KEY',
      baseUrl: 'https://api.openai.com/v1',
    },
    deepseek: {
      model: 'deepseek-v4-flash',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      baseUrl: 'https://api.deepseek.com',
    },
  });

const harnessConfigSchema = z
  .object({
    runtime: runtimeConfigSchema,
    model: modelConfigSchema,
  })
  .passthrough();

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export interface LoadHarnessConfigOptions {
  envPath?: string | false;
}

function stripInlineComment(value: string): string {
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && quote === '"') {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = undefined;
      continue;
    }

    if (char === '#' && !quote && (index === 0 || /\s/.test(value[index - 1] ?? ''))) {
      return value.slice(0, index);
    }
  }

  return value;
}

function unquoteEnvValue(value: string): string {
  const trimmed = stripInlineComment(value).trim();
  const quote = trimmed[0];

  if (
    (quote === '"' || quote === "'") &&
    trimmed.length >= 2 &&
    trimmed.at(-1) === quote
  ) {
    const inner = trimmed.slice(1, -1);

    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    return inner;
  }

  return trimmed;
}

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return undefined;
  }

  const assignment = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trimStart()
    : trimmed;
  const equalsIndex = assignment.indexOf('=');

  if (equalsIndex <= 0) {
    return undefined;
  }

  const key = assignment.slice(0, equalsIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return undefined;
  }

  return [key, unquoteEnvValue(assignment.slice(equalsIndex + 1))];
}

export async function loadEnvFile(path = '.env'): Promise<boolean> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}

export async function loadHarnessConfig(
  path = 'configs/harness.yaml',
  options: LoadHarnessConfigOptions = {},
): Promise<HarnessConfig> {
  if (options.envPath !== false) {
    await loadEnvFile(options.envPath ?? '.env');
  }

  const raw = await readFile(path, 'utf8');
  return harnessConfigSchema.parse(parse(raw));
}
