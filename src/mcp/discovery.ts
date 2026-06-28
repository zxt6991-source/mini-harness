// 该文件负责从 MCP 客户端分页发现工具，并把发现到的工具包装成内部可执行工具。
import type { Tool } from '../core';
import type { McpClient } from './client';
import { McpToolAdapter } from './adapter';

/** 分页读取 MCP 服务暴露的全部工具，并包装成内部 Tool 实例。 */
export async function discoverMcpTools(client: McpClient): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listTools(cursor);
    tools.push(...result.tools.map((tool) => new McpToolAdapter(tool, client)));
    cursor = result.nextCursor;
  } while (cursor);

  return tools;
}
