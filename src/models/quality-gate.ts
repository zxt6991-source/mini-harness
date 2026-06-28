// 该文件对模型输出做基础质量校验，防止空内容且无工具调用的响应继续流转。
import type { ModelChatOutput } from '../core';
import { ModelProviderError } from '../core';

/** 校验模型输出至少包含文本内容或工具调用，避免空响应继续进入主循环。 */
export function ensureModelOutput(output: ModelChatOutput): ModelChatOutput {
  const hasContent = output.message.content.trim().length > 0;
  const hasToolCalls = (output.message.toolCalls?.length ?? 0) > 0;

  if (!hasContent && !hasToolCalls) {
    throw new ModelProviderError(
      'Model returned an empty response',
      'MODEL_EMPTY_RESPONSE',
      { retryable: true },
    );
  }

  return output;
}
