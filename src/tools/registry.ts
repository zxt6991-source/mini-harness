import type {
  Message,
  Tool,
  ToolCall,
  ToolContext,
  ToolRegistry,
} from '../core';
import { ToolNotFoundError } from '../core';
import type { ToolExecutor } from './executor';

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(private readonly executor?: ToolExecutor) {}

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

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
        toolName: tool.name,
        success: result.success,
        ...result.metadata,
      },
    };
  }
}
