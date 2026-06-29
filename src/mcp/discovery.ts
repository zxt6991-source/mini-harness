// 该文件负责从 MCP 客户端分页发现工具，并把发现到的工具包装成内部可执行工具。
import type { Tool } from '../core';
import type { McpClient } from './client';
import { McpToolAdapter, type McpToolAdapterOptions } from './adapter';
import type { McpTool } from './protocol';

export const DEFAULT_MCP_DISCOVERY_CACHE_TTL_MS = 300_000;

export interface McpToolDiscoveryOptions extends McpToolAdapterOptions {
  cacheTtlMs?: number;
  forceRefresh?: boolean;
  now?: () => number;
}

interface CachedDiscovery {
  expiresAt: number;
  tools: McpTool[];
}

const discoveryCache = new WeakMap<McpClient, CachedDiscovery>();

function hasInitialize(
  client: McpClient,
): client is McpClient & { initialize: () => Promise<unknown> } {
  return typeof client.initialize === 'function';
}

/** 分页读取 MCP 服务暴露的全部工具，并包装成内部 Tool 实例。 */
export async function discoverMcpTools(
  client: McpClient,
  options: McpToolDiscoveryOptions = {},
): Promise<Tool[]> {
  const now = options.now?.() ?? Date.now();
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_MCP_DISCOVERY_CACHE_TTL_MS;
  const cached = discoveryCache.get(client);

  if (
    !options.forceRefresh &&
    cacheTtlMs > 0 &&
    cached &&
    cached.expiresAt > now
  ) {
    return cached.tools.map((tool) => new McpToolAdapter(tool, client, options));
  }

  if (hasInitialize(client)) {
    await client.initialize();
  }

  const mcpTools: McpTool[] = [];
  let cursor: string | undefined;

  do {
    const result = await client.listTools(cursor);
    mcpTools.push(...result.tools);
    cursor = result.nextCursor;
  } while (cursor);

  if (cacheTtlMs > 0) {
    discoveryCache.set(client, {
      expiresAt: now + cacheTtlMs,
      tools: mcpTools,
    });
  }

  return mcpTools.map((tool) => new McpToolAdapter(tool, client, options));
}
