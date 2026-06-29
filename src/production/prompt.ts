// 该文件实现模块化系统提示词构建，保留稳定前缀的缓存元数据。
import { createHash } from 'node:crypto';

export type PromptModuleName =
  | 'core_identity'
  | 'capabilities'
  | 'domain_knowledge'
  | 'context_specific';

export interface PromptModuleInput {
  id: string;
  module: PromptModuleName;
  content: string;
  cacheable?: boolean;
  priority?: number;
}

export interface ModularPromptBuilderOptions {
  cacheBoundaryCharacters?: number;
}

export interface PromptModuleBreakdown {
  sections: number;
  characters: number;
  cacheableCharacters: number;
  dynamicCharacters: number;
}

export interface ModularPromptMetadata {
  cacheKey: string;
  staticCharacters: number;
  dynamicCharacters: number;
  totalCharacters: number;
  cacheBoundaryCharacters: number;
  moduleBreakdown: Record<PromptModuleName, PromptModuleBreakdown>;
}

export interface ModularPromptBuildResult {
  prompt: string;
  staticPrefix: string;
  dynamicSuffix: string;
  metadata: ModularPromptMetadata;
}

const MODULE_ORDER: PromptModuleName[] = [
  'core_identity',
  'capabilities',
  'domain_knowledge',
  'context_specific',
];

function createEmptyBreakdown(): Record<PromptModuleName, PromptModuleBreakdown> {
  return {
    core_identity: {
      sections: 0,
      characters: 0,
      cacheableCharacters: 0,
      dynamicCharacters: 0,
    },
    capabilities: {
      sections: 0,
      characters: 0,
      cacheableCharacters: 0,
      dynamicCharacters: 0,
    },
    domain_knowledge: {
      sections: 0,
      characters: 0,
      cacheableCharacters: 0,
      dynamicCharacters: 0,
    },
    context_specific: {
      sections: 0,
      characters: 0,
      cacheableCharacters: 0,
      dynamicCharacters: 0,
    },
  };
}

function renderVariables(content: string, variables: Record<string, unknown>): string {
  return content.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export class ModularPromptBuilder {
  private readonly modules: PromptModuleInput[];
  private readonly cacheBoundaryCharacters: number;

  constructor(
    modules: PromptModuleInput[],
    options: ModularPromptBuilderOptions = {},
  ) {
    this.modules = [...modules];
    this.cacheBoundaryCharacters = options.cacheBoundaryCharacters ?? 48_000;
  }

  build(variables: Record<string, unknown> = {}): ModularPromptBuildResult {
    const staticSections: string[] = [];
    const dynamicSections: string[] = [];
    const moduleBreakdown = createEmptyBreakdown();

    for (const moduleName of MODULE_ORDER) {
      const sections = this.modules
        .filter((module) => module.module === moduleName)
        .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));

      for (const section of sections) {
        const content = renderVariables(section.content, variables);
        const cacheable = section.cacheable ?? section.module !== 'context_specific';
        const breakdown = moduleBreakdown[moduleName];

        breakdown.sections++;
        breakdown.characters += content.length;

        if (cacheable) {
          staticSections.push(content);
          breakdown.cacheableCharacters += content.length;
        } else {
          dynamicSections.push(content);
          breakdown.dynamicCharacters += content.length;
        }
      }
    }

    const staticPrefix = staticSections.join('\n\n');
    const dynamicSuffix = dynamicSections.join('\n\n');
    const prompt = [staticPrefix, dynamicSuffix].filter(Boolean).join('\n\n');

    return {
      prompt,
      staticPrefix,
      dynamicSuffix,
      metadata: {
        cacheKey: shortHash(staticPrefix),
        staticCharacters: staticPrefix.length,
        dynamicCharacters: dynamicSuffix.length,
        totalCharacters: prompt.length,
        cacheBoundaryCharacters: this.cacheBoundaryCharacters,
        moduleBreakdown,
      },
    };
  }
}
