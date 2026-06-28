// 该文件负责把工具输出归一化为稳定 ToolResult，并控制大结果写入上下文的大小。
import type { Tool, ToolContext, ToolResult } from '../core';
import { ToolResultError } from '../core';

export const DEFAULT_MAX_RESULT_CHARACTERS = 64_000;

/** 归一化工具结果，补齐 metadata 并按工具能力限制截断 content。 */
export function normalizeToolResult(
  tool: Tool,
  result: ToolResult,
  ctx: ToolContext,
  latencyMs: number,
): ToolResult {
  if (!result || typeof result !== 'object') {
    throw new ToolResultError(`Tool '${tool.name}' returned an invalid result`);
  }

  let content = typeof result.content === 'string' ? result.content : '';
  const maxResultCharacters =
    tool.capability?.maxResultCharacters ?? DEFAULT_MAX_RESULT_CHARACTERS;
  let metadata = result.metadata ? { ...result.metadata } : undefined;

  const ensureMetadata = () => {
    metadata ??= {};
    metadata.toolName = tool.name;
    if (ctx.toolCallId) {
      metadata.toolCallId = ctx.toolCallId;
    }
    metadata.latencyMs = latencyMs;
    if (ctx.timeoutMs) {
      metadata.timeoutMs = ctx.timeoutMs;
    }
    metadata.success = result.success;
    return metadata;
  };

  if (metadata || ctx.toolCallId || ctx.timeoutMs) {
    ensureMetadata();
  }

  if (content.length > maxResultCharacters) {
    const originalLength = content.length;
    content = `${content.slice(
      0,
      maxResultCharacters,
    )}\n... [output truncated from ${originalLength} characters]`;
    const resultMetadata = ensureMetadata();
    resultMetadata.truncated = true;
    resultMetadata.originalLength = originalLength;
    resultMetadata.maxResultCharacters = maxResultCharacters;
  }

  return {
    success: result.success === true,
    content,
    ...(metadata ? { metadata } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    ...(result.errorName ? { errorName: result.errorName } : {}),
  };
}
