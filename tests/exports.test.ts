import { describe, expect, it } from 'vitest';
import {
  ChatCompletionsProvider,
  ConsolidatingMemory,
  MarkdownMemoryStore,
  createModelProvider,
  createMemory,
  loadHarnessConfig,
  parseChatCompletionResponse,
} from '../src';

describe('public exports', () => {
  it('exports chat completions integration APIs', () => {
    expect(ChatCompletionsProvider).toBeTypeOf('function');
    expect(ConsolidatingMemory).toBeTypeOf('function');
    expect(MarkdownMemoryStore).toBeTypeOf('function');
    expect(createModelProvider).toBeTypeOf('function');
    expect(createMemory).toBeTypeOf('function');
    expect(loadHarnessConfig).toBeTypeOf('function');
    expect(parseChatCompletionResponse).toBeTypeOf('function');
  });
});
