import { describe, expect, it } from 'vitest';
import {
  ChatCompletionsProvider,
  createModelProvider,
  loadHarnessConfig,
  parseChatCompletionResponse,
} from '../src';

describe('public exports', () => {
  it('exports chat completions integration APIs', () => {
    expect(ChatCompletionsProvider).toBeTypeOf('function');
    expect(createModelProvider).toBeTypeOf('function');
    expect(loadHarnessConfig).toBeTypeOf('function');
    expect(parseChatCompletionResponse).toBeTypeOf('function');
  });
});
