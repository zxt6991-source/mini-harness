import type { Tool, ToolContext, ToolResult } from '../core';
import type { McpClient } from './client';
import type { McpCallToolResult, McpContent, McpTool } from './protocol';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

export class McpToolAdapter implements Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: unknown;

  constructor(
    private readonly tool: McpTool,
    private readonly client: McpClient,
  ) {
    this.name = tool.name;
    this.description = tool.description ?? tool.title ?? tool.name;
    this.schema = tool.inputSchema;
  }

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
