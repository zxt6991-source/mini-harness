import type { Tool } from '../core';
import type { McpClient } from './client';
import { McpToolAdapter } from './adapter';

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
