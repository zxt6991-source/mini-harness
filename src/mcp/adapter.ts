// 该文件将 MCP 工具适配为 MiniHarness 内部 Tool 接口，并把 MCP 内容转换为文本结果。
import type { Tool, ToolContext, ToolResult } from '../core';
import type { McpClient } from './client';
import type { McpCallToolResult, McpContent, McpTool } from './protocol';

/** 判断未知值是否为普通对象，便于安全访问 MCP resource 字段。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 将 MCP 多种内容类型转换成可写入工具结果的文本表示。 */
function contentToText(content: McpContent): string {
  if (content.type === 'text') {
    return typeof content.text === 'string' ? content.text : '';
  }

  if (content.type === 'image') {
    return `[image:${content.mimeType ?? 'application/octet-stream'}]`;
  }

  if (content.type === 'audio') {
    return `[audio:${content.mimeType ?? 'application/octet-stream'}]`;
  }

  if (content.type === 'resource_link') {
    return `[resource:${content.uri}]`;
  }

  if (content.type === 'resource') {
    const resource = isRecord(content.resource) ? content.resource : undefined;
    if (typeof resource?.text === 'string') {
      return resource.text;
    }

    if (typeof resource?.uri === 'string') {
      return `[resource:${resource.uri}]`;
    }
  }

  return JSON.stringify(content);
}

/** 将 MCP 工具调用结果转换为 MiniHarness 内部 ToolResult。 */
function resultToToolResult(
  result: McpCallToolResult,
  serverName: string,
  toolName: string,
): ToolResult {
  return {
    success: result.isError !== true,
    content: result.content.map(contentToText).join('\n'),
    metadata: {
      mcpServerName: serverName,
      mcpToolName: toolName,
      mcpContent: result.content,
      structuredContent: result.structuredContent,
      isError: result.isError ?? false,
    },
  };
}

/** MCP 工具适配器，把远端 MCP 工具包装成内部 Tool 接口。 */
export class McpToolAdapter implements Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: unknown;

  /** 绑定 MCP 工具元数据和客户端，生成可被模型调用的内部工具。 */
  constructor(
    private readonly tool: McpTool,
    private readonly client: McpClient,
  ) {
    this.name = tool.name;
    this.description = tool.description ?? tool.title ?? tool.name;
    this.schema = tool.inputSchema;
  }

  /** 转发工具调用到 MCP 客户端，并把 MCP 结果转换成内部工具结果。 */
  async call(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const result = await this.client.callTool({
      name: this.name,
      arguments: input,
      traceId: ctx.traceId,
    });

    return resultToToolResult(result, this.client.serverName, this.name);
  }
}
