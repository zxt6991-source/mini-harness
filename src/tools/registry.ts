// 该文件实现默认工具注册表，负责注册、查询和执行模型发起的工具调用。
import type {
  Message,
  Tool,
  ToolCapability,
  ToolCall,
  ToolContext,
  ToolRegistry,
} from '../core';
import { ToolNotFoundError, ToolValidationError } from '../core';
import {
  ToolSchemaCache,
  type ToolSchemaCacheStats,
} from '../production/schema-cache';
import type { ToolExecutor } from './executor';
import { normalizeToolSchema } from './validation';

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface DefaultToolRegistryOptions {
  schemaCache?: ToolSchemaCache | false;
}

/** 默认工具注册表，管理工具集合并把工具调用结果转换成 tool 消息。 */
export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly capabilities = new Map<string, ToolCapability>();
  private readonly schemaCache: ToolSchemaCache | undefined;

  /** 可选注入工具执行器，以便在执行前后加入安全校验和日志等横切逻辑。 */
  constructor(
    private readonly executor?: ToolExecutor,
    options: DefaultToolRegistryOptions = {},
  ) {
    this.schemaCache =
      options.schemaCache === false
        ? undefined
        : options.schemaCache ?? new ToolSchemaCache();
  }

  /** 注册一个工具名称唯一的工具实例。 */
  register(tool: Tool): void {
    if (!TOOL_NAME_PATTERN.test(tool.name)) {
      throw new ToolValidationError(`Invalid tool name: ${tool.name}`);
    }

    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
    this.capabilities.set(tool.name, this.buildCapability(tool));
  }

  /** 根据工具名称查找已注册工具。 */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** 返回当前注册表中的全部工具。 */
  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** 返回当前注册表中全部工具的能力描述，供 UI、调试和动态发现使用。 */
  listCapabilities(): ToolCapability[] {
    return [...this.capabilities.values()];
  }

  /** 查询单个工具的能力描述。 */
  getCapability(name: string): ToolCapability | undefined {
    return this.capabilities.get(name);
  }

  /** 注销工具及其能力缓存。 */
  unregister(name: string): boolean {
    const removed = this.tools.delete(name);
    this.capabilities.delete(name);
    return removed;
  }

  getSchemaCacheStats(): ToolSchemaCacheStats | undefined {
    return this.schemaCache?.stats();
  }

  /** 执行一次模型发起的工具调用，并封装为可回传给模型的 tool 消息。 */
  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<Message> {
    const tool = this.get(toolCall.name);

    if (!tool) {
      throw new ToolNotFoundError(toolCall.name);
    }

    const result = this.executor
      ? await this.executor.execute(
          tool,
          toolCall.arguments,
          ctx,
          this.getCapability(tool.name),
        )
      : await tool.call(toolCall.arguments, ctx);

    return {
      id: toolCall.id,
      role: 'tool',
      content: result.content,
      createdAt: Date.now(),
      metadata: {
        toolCallId: toolCall.id,
        toolName: tool.name,
        success: result.success,
        ...result.metadata,
      },
    };
  }

  /** 从工具实例构造完整能力描述并缓存 schema。 */
  private buildCapability(tool: Tool): ToolCapability {
    const partial = tool.capability ?? {};
    const schema = normalizeToolSchema(tool.schema);
    const schemaEntry = this.schemaCache?.remember(schema);
    const metadata = {
      ...partial.metadata,
      ...(schemaEntry
        ? {
            schemaHash: schemaEntry.hash,
            schemaCharacters: schemaEntry.characters,
          }
        : {}),
    };

    return {
      name: tool.name,
      description: tool.description,
      schema,
      category: partial.category ?? 'builtin',
      accessLevel: partial.accessLevel ?? 'public',
      source: partial.source ?? 'custom',
      ...partial,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  }
}
