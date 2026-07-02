// 该文件负责加载 .env 和 YAML 配置，并用 zod 校验生成 MiniHarness 运行配置。
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

const providerConfigSchema = z.object({
  model: z.string(),
  apiKeyEnv: z.string(),
  baseUrl: z.string().url(),
});

const runtimeRetryConfigSchema = z
  .object({
    maxRetries: z.number().int().nonnegative().default(0),
    initialBackoffMs: z.number().int().nonnegative().default(250),
    maxBackoffMs: z.number().int().nonnegative().default(2_000),
    jitterRatio: z.number().min(0).max(1).default(0),
  })
  .default({
    maxRetries: 0,
    initialBackoffMs: 250,
    maxBackoffMs: 2_000,
    jitterRatio: 0,
  });

const runtimeBudgetConfigSchema = z
  .object({
    maxModelCalls: z.number().int().positive().default(20),
    maxEstimatedTokens: z.number().int().positive().default(1_000_000),
    maxContextCharacters: z.number().int().positive().default(120_000),
    reserveOutputTokens: z.number().int().nonnegative().default(4_000),
  })
  .default({
    maxModelCalls: 20,
    maxEstimatedTokens: 1_000_000,
    maxContextCharacters: 120_000,
    reserveOutputTokens: 4_000,
  });

const runtimeDriftConfigSchema = z
  .object({
    maxToolCalls: z.number().int().positive().default(50),
    repeatedToolWindow: z.number().int().positive().default(6),
    repeatedToolThreshold: z.number().int().positive().default(1_000_000),
    reflectionInterval: z.number().int().nonnegative().default(0),
  })
  .default({
    maxToolCalls: 50,
    repeatedToolWindow: 6,
    repeatedToolThreshold: 1_000_000,
    reflectionInterval: 0,
  });

const runtimeConfigSchema = z
  .object({
    maxSteps: z.number().int().positive().default(8),
    requestTimeoutMs: z.number().int().positive().default(60_000),
    toolTimeoutMs: z.number().int().positive().default(30_000),
    enableStream: z.boolean().default(false),
    maxConcurrentTools: z.number().int().positive().default(1),
    toolErrorMode: z.enum(['throw', 'observe']).default('throw'),
    modelRetry: runtimeRetryConfigSchema,
    budget: runtimeBudgetConfigSchema,
    drift: runtimeDriftConfigSchema,
  })
  .default({
    maxSteps: 8,
    requestTimeoutMs: 60_000,
    toolTimeoutMs: 30_000,
    enableStream: false,
    maxConcurrentTools: 1,
    toolErrorMode: 'throw',
    modelRetry: {
      maxRetries: 0,
      initialBackoffMs: 250,
      maxBackoffMs: 2_000,
      jitterRatio: 0,
    },
    budget: {
      maxModelCalls: 20,
      maxEstimatedTokens: 1_000_000,
      maxContextCharacters: 120_000,
      reserveOutputTokens: 4_000,
    },
    drift: {
      maxToolCalls: 50,
      repeatedToolWindow: 6,
      repeatedToolThreshold: 1_000_000,
      reflectionInterval: 0,
    },
  });

const modelConfigSchema = z
  .object({
    provider: z.enum(['mock', 'openai', 'deepseek']).default('mock'),
    temperature: z.number().optional(),
    maxTokens: z.number().int().positive().optional(),
    selection: z
      .object({
        enabled: z.boolean().default(false),
        failureThreshold: z.number().int().positive().default(3),
        resetTimeoutMs: z.number().int().positive().default(60_000),
        fallbackChain: z
          .array(z.enum(['mock', 'openai', 'deepseek']))
          .default([]),
      })
      .default({
        enabled: false,
        failureThreshold: 3,
        resetTimeoutMs: 60_000,
        fallbackChain: [],
      }),
    reasoning: z
      .object({
        strategy: z
          .enum(['disabled', 'adaptive', 'budget_based', 'required'])
          .default('disabled'),
        complexityThreshold: z
          .enum(['easy', 'medium', 'hard', 'very_hard'])
          .default('medium'),
        maxReasoningTokensPerSession: z
          .number()
          .int()
          .nonnegative()
          .default(100_000),
        maxReasoningCostPerSession: z.number().nonnegative().default(0),
      })
      .default({
        strategy: 'disabled',
        complexityThreshold: 'medium',
        maxReasoningTokensPerSession: 100_000,
        maxReasoningCostPerSession: 0,
      }),
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
    selection: {
      enabled: false,
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
      fallbackChain: [],
    },
    reasoning: {
      strategy: 'disabled',
      complexityThreshold: 'medium',
      maxReasoningTokensPerSession: 100_000,
      maxReasoningCostPerSession: 0,
    },
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

const outputGovernanceConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    mode: z.enum(['throw', 'observe', 'self_correct']).default('observe'),
    maxCorrectionTurns: z.number().int().nonnegative().default(1),
    allowUnknownTools: z.boolean().default(false),
    strictAdditionalProperties: z.boolean().default(true),
    injectionPatterns: z
      .array(z.string())
      .default(['rm -rf', 'DROP TABLE', '<script', '${jndi:']),
  })
  .default({
    enabled: true,
    mode: 'observe',
    maxCorrectionTurns: 1,
    allowUnknownTools: false,
    strictAdditionalProperties: true,
    injectionPatterns: ['rm -rf', 'DROP TABLE', '<script', '${jndi:'],
  });

const featureGateRuleConfigSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().optional(),
    rolloutPercent: z.number().min(0).max(100).optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  }),
]);

const memorySummaryConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    maxSummaryCharacters: z.number().int().positive().default(500),
  })
  .default({
    enabled: true,
    maxSummaryCharacters: 500,
  });

const memoryContextCacheConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    staticTtlMs: z.number().int().positive().default(600_000),
    dynamicTtlMs: z.number().int().positive().default(30_000),
  })
  .default({
    enabled: true,
    staticTtlMs: 600_000,
    dynamicTtlMs: 30_000,
  });

const memoryContextConfigSchema = z
  .object({
    systemPrompt: z.string().default('You are MiniHarness Agent.'),
    maxContextCharacters: z.number().int().positive().default(12_000),
    protectedCharacters: z.number().int().positive().default(2_000),
    minSectionCharacters: z.number().int().positive().default(200),
    cache: memoryContextCacheConfigSchema,
  })
  .default({
    systemPrompt: 'You are MiniHarness Agent.',
    maxContextCharacters: 12_000,
    protectedCharacters: 2_000,
    minSectionCharacters: 200,
    cache: {
      enabled: true,
      staticTtlMs: 600_000,
      dynamicTtlMs: 30_000,
    },
  });

const memoryConsolidationConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    timeGateMs: z.number().int().positive().default(86_400_000),
    sessionGate: z.number().int().positive().default(5),
    contextUtilizationGate: z.number().positive().default(0.7),
    minMessages: z.number().int().positive().default(8),
    prune: z
      .object({
        expiredEntries: z.boolean().default(true),
        lowConfidenceThreshold: z.number().min(0).max(1).default(0.3),
        staleDays: z.number().int().positive().default(30),
      })
      .default({
        expiredEntries: true,
        lowConfidenceThreshold: 0.3,
        staleDays: 30,
      }),
  })
  .default({
    enabled: true,
    timeGateMs: 86_400_000,
    sessionGate: 5,
    contextUtilizationGate: 0.7,
    minMessages: 8,
    prune: {
      expiredEntries: true,
      lowConfidenceThreshold: 0.3,
      staleDays: 30,
    },
  });

const memoryIndexConfigSchema = z
  .object({
    keyword: z
      .object({
        enabled: z.boolean().default(true),
        minTokenLength: z.number().int().positive().default(2),
      })
      .default({
        enabled: true,
        minTokenLength: 2,
      }),
    vector: z
      .object({
        enabled: z.boolean().default(false),
      })
      .default({
        enabled: false,
      }),
  })
  .default({
    keyword: {
      enabled: true,
      minTokenLength: 2,
    },
    vector: {
      enabled: false,
    },
  });

const memoryConfigSchema = z
  .object({
    type: z.enum(['local', 'in-memory']).default('local'),
    rootDir: z.string().default('.miniharness/memory'),
    recentLimit: z.number().int().nonnegative().default(20),
    searchTopK: z.number().int().nonnegative().default(5),
    summary: memorySummaryConfigSchema,
    context: memoryContextConfigSchema,
    consolidation: memoryConsolidationConfigSchema,
    index: memoryIndexConfigSchema,
  })
  .default({
    type: 'local',
    rootDir: '.miniharness/memory',
    recentLimit: 20,
    searchTopK: 5,
    summary: {
      enabled: true,
      maxSummaryCharacters: 500,
    },
    context: {
      systemPrompt: 'You are MiniHarness Agent.',
      maxContextCharacters: 12_000,
      protectedCharacters: 2_000,
      minSectionCharacters: 200,
      cache: {
        enabled: true,
        staticTtlMs: 600_000,
        dynamicTtlMs: 30_000,
      },
    },
    consolidation: {
      enabled: true,
      timeGateMs: 86_400_000,
      sessionGate: 5,
      contextUtilizationGate: 0.7,
      minMessages: 8,
      prune: {
        expiredEntries: true,
        lowConfidenceThreshold: 0.3,
        staleDays: 30,
      },
    },
    index: {
      keyword: {
        enabled: true,
        minTokenLength: 2,
      },
      vector: {
        enabled: false,
      },
    },
  });

const orchestrationRetryConfigSchema = z
  .object({
    initialBackoffMs: z.number().int().nonnegative().default(250),
    maxBackoffMs: z.number().int().nonnegative().default(5_000),
  })
  .default({
    initialBackoffMs: 250,
    maxBackoffMs: 5_000,
  });

const orchestrationCheckpointConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    store: z.enum(['memory', 'jsonl']).default('memory'),
    rootDir: z
      .string()
      .default('.miniharness/orchestration/checkpoints'),
  })
  .default({
    enabled: true,
    store: 'memory',
    rootDir: '.miniharness/orchestration/checkpoints',
  });

const orchestrationMessagesConfigSchema = z
  .object({
    maxQueueSize: z.number().int().positive().default(1_000),
    requireAckByDefault: z.boolean().default(false),
  })
  .default({
    maxQueueSize: 1_000,
    requireAckByDefault: false,
  });

const orchestrationScratchpadConfigSchema = z
  .object({
    maxEntries: z.number().int().positive().default(1_000),
    maxValueCharacters: z.number().int().positive().default(20_000),
  })
  .default({
    maxEntries: 1_000,
    maxValueCharacters: 20_000,
  });

const orchestrationConfigSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }

    const record = value as Record<string, unknown>;
    if (record.enabled === undefined && record.enable !== undefined) {
      return {
        ...record,
        enabled: record.enable,
      };
    }

    return value;
  },
  z
    .object({
      enabled: z.boolean().default(true),
      defaultRole: z.string().default('default'),
      maxRetries: z.number().int().nonnegative().default(1),
      continueOnFailure: z.boolean().default(true),
      maxConcurrentTasks: z.number().int().positive().default(1),
      defaultTaskTimeoutMs: z.number().int().positive().default(300_000),
      retry: orchestrationRetryConfigSchema,
      checkpoint: orchestrationCheckpointConfigSchema,
      messages: orchestrationMessagesConfigSchema,
      scratchpad: orchestrationScratchpadConfigSchema,
    })
    .default({
      enabled: true,
      defaultRole: 'default',
      maxRetries: 1,
      continueOnFailure: true,
      maxConcurrentTasks: 1,
      defaultTaskTimeoutMs: 300_000,
      retry: {
        initialBackoffMs: 250,
        maxBackoffMs: 5_000,
      },
      checkpoint: {
        enabled: true,
        store: 'memory',
        rootDir: '.miniharness/orchestration/checkpoints',
      },
      messages: {
        maxQueueSize: 1_000,
        requireAckByDefault: false,
      },
      scratchpad: {
        maxEntries: 1_000,
        maxValueCharacters: 20_000,
      },
    }),
);

const productionConfigSchema = z
  .object({
    environment: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    featureGates: z
      .record(z.string(), featureGateRuleConfigSchema)
      .default({
        schemaCache: true,
        modularPrompt: true,
        metrics: true,
      }),
    prompt: z
      .object({
        cacheBoundaryCharacters: z.number().int().positive().default(48_000),
        exposeMetadata: z.boolean().default(true),
      })
      .default({
        cacheBoundaryCharacters: 48_000,
        exposeMetadata: true,
      }),
    schemaCache: z
      .object({
        enabled: z.boolean().default(true),
        store: z.enum(['memory', 'json']).default('memory'),
        rootDir: z.string().default('.miniharness/production/schema-cache'),
        maxEntries: z.number().int().positive().default(1_000),
      })
      .default({
        enabled: true,
        store: 'memory',
        rootDir: '.miniharness/production/schema-cache',
        maxEntries: 1_000,
      }),
    metrics: z
      .object({
        enabled: z.boolean().default(true),
        latencyWarningMs: z.number().int().positive().default(2_000),
        errorRateWarningThreshold: z.number().min(0).max(1).default(0.01),
      })
      .default({
        enabled: true,
        latencyWarningMs: 2_000,
        errorRateWarningThreshold: 0.01,
      }),
  })
  .default({
    environment: 'development',
    featureGates: {
      schemaCache: true,
      modularPrompt: true,
      metrics: true,
    },
    prompt: {
      cacheBoundaryCharacters: 48_000,
      exposeMetadata: true,
    },
    schemaCache: {
      enabled: true,
      store: 'memory',
      rootDir: '.miniharness/production/schema-cache',
      maxEntries: 1_000,
    },
    metrics: {
      enabled: true,
      latencyWarningMs: 2_000,
      errorRateWarningThreshold: 0.01,
    },
  });

const securityNumericRangeConfigSchema = z.object({
  min: z.number(),
  max: z.number(),
});

const securityConfigSchema = z
  .object({
    allowTools: z.array(z.string()).default([]),
    denyTools: z.array(z.string()).default([]),
    sandboxDir: z.string().default('./workspace'),
    allowNetwork: z.boolean().default(false),
    allowShell: z.boolean().default(false),
    allowedShellCommands: z.array(z.string()).default([]),
    pathValidation: z
      .object({
        enabled: z.boolean().default(true),
        maxPathLength: z.number().int().positive().default(4096),
        pathParameterNames: z
          .array(z.string())
          .default(['path', 'filePath', 'dirPath', 'cwd', 'workspaceDir']),
      })
      .default({
        enabled: true,
        maxPathLength: 4096,
        pathParameterNames: ['path', 'filePath', 'dirPath', 'cwd', 'workspaceDir'],
      }),
    commandGuardrails: z
      .object({
        enabled: z.boolean().default(true),
        dangerousCommands: z.array(z.string()).optional(),
        safeSubcommands: z.record(z.string(), z.array(z.string())).optional(),
        blockShellControlOperators: z.boolean().default(true),
        blockInlineExecution: z.boolean().default(true),
      })
      .default({
        enabled: true,
        blockShellControlOperators: true,
        blockInlineExecution: true,
      }),
    parameterConstraints: z
      .object({
        timeoutMs: securityNumericRangeConfigSchema.optional(),
        timeout_seconds: securityNumericRangeConfigSchema.optional(),
        memoryMb: securityNumericRangeConfigSchema.optional(),
        memory_mb: securityNumericRangeConfigSchema.optional(),
        fileSizeMb: securityNumericRangeConfigSchema.optional(),
        file_size_mb: securityNumericRangeConfigSchema.optional(),
      })
      .default({}),
    audit: z
      .object({
        enabled: z.boolean().default(true),
      })
      .default({
        enabled: true,
      }),
  })
  .default({
    allowTools: [],
    denyTools: [],
    sandboxDir: './workspace',
    allowNetwork: false,
    allowShell: false,
    allowedShellCommands: [],
    pathValidation: {
      enabled: true,
      maxPathLength: 4096,
      pathParameterNames: ['path', 'filePath', 'dirPath', 'cwd', 'workspaceDir'],
    },
    commandGuardrails: {
      enabled: true,
      blockShellControlOperators: true,
      blockInlineExecution: true,
    },
    parameterConstraints: {},
    audit: {
      enabled: true,
    },
  });

const harnessConfigSchema = z
  .object({
    runtime: runtimeConfigSchema,
    model: modelConfigSchema,
    memory: memoryConfigSchema,
    outputGovernance: outputGovernanceConfigSchema,
    orchestration: orchestrationConfigSchema,
    production: productionConfigSchema,
    security: securityConfigSchema,
  })
  .passthrough();

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export interface LoadHarnessConfigOptions {
  envPath?: string | false;
}

/** 移除 .env 值中的行内注释，同时保留引号内的 # 字符。 */
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

/** 去除 .env 值的外层引号，并处理双引号字符串中的常见转义字符。 */
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

/** 解析一行 .env 内容，返回合法的键值对或忽略空行、注释和非法行。 */
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

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (/^(true|yes|1|on)$/i.test(value)) {
    return true;
  }

  if (/^(false|no|0|off)$/i.test(value)) {
    return false;
  }

  return undefined;
}

function envFeatureNameToKey(name: string): string {
  return name
    .toLowerCase()
    .split('_')
    .map((part, index) =>
      index === 0 ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join('');
}

function applyProductionEnvOverrides(config: HarnessConfig): HarnessConfig {
  const production = {
    ...config.production,
    featureGates: { ...config.production.featureGates },
    prompt: { ...config.production.prompt },
    schemaCache: { ...config.production.schemaCache },
    metrics: { ...config.production.metrics },
  };

  const environment = process.env.HARNESS_ENVIRONMENT;
  if (
    environment === 'development' ||
    environment === 'test' ||
    environment === 'staging' ||
    environment === 'production'
  ) {
    production.environment = environment;
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('HARNESS_FEATURE_')) {
      continue;
    }

    const parsed = parseBooleanEnv(value);
    if (parsed === undefined) {
      continue;
    }

    production.featureGates[envFeatureNameToKey(key.slice('HARNESS_FEATURE_'.length))] =
      parsed;
  }

  const metricsEnabled = parseBooleanEnv(process.env.HARNESS_METRICS_ENABLED);
  if (metricsEnabled !== undefined) {
    production.metrics.enabled = metricsEnabled;
  }

  const schemaCacheEnabled = parseBooleanEnv(process.env.HARNESS_SCHEMA_CACHE_ENABLED);
  if (schemaCacheEnabled !== undefined) {
    production.schemaCache.enabled = schemaCacheEnabled;
  }

  return {
    ...config,
    production,
  };
}

/** 加载 .env 文件，将尚未存在于 process.env 的变量写入当前进程环境。 */
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

/** 加载 MiniHarness YAML 配置，并在读取配置前按需加载 .env 文件。 */
export async function loadHarnessConfig(
  path = 'configs/harness.yaml',
  options: LoadHarnessConfigOptions = {},
): Promise<HarnessConfig> {
  if (options.envPath !== false) {
    await loadEnvFile(options.envPath ?? '.env');
  }

  const raw = await readFile(path, 'utf8');
  return applyProductionEnvOverrides(harnessConfigSchema.parse(parse(raw)));
}
