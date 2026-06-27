import type { ModelChatOutput } from '../core';
import { ModelProviderError } from '../core';

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
