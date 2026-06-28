// 该文件实现默认工具注册表，负责注册、查询和执行模型发起的工具调用。
import type {
  Message,
  Tool,
  ToolCall,
  ToolContext,
  ToolRegistry,
} from '../core';
import { ToolNotFoundError } from '../core';
import type { ToolExecutor } from './executor';

/** 默认工具注册表，管理工具集合并把工具调用结果转换成 tool 消息。 */
export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /** 可选注入工具执行器，以便在执行前后加入安全校验和日志等横切逻辑。 */
  constructor(private readonly executor?: ToolExecutor) {}

  /** 注册一个工具名称唯一的工具实例。 */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  /** 根据工具名称查找已注册工具。 */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** 返回当前注册表中的全部工具。 */
  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** 执行一次模型发起的工具调用，并封装为可回传给模型的 tool 消息。 */
  async execute(toolCall: ToolCall, ctx: ToolContext): Promise<Message> {
    const tool = this.get(toolCall.name);

    if (!tool) {
      throw new ToolNotFoundError(toolCall.name);
    }

    const result = this.executor
      ? await this.executor.execute(tool, toolCall.arguments, ctx)
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
}
