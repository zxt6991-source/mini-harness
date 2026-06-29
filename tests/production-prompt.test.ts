import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import { ContextBuilder } from '../src/memory/context-builder';
import { InMemoryStore } from '../src/memory/local-store';
import { ModularPromptBuilder } from '../src/production/prompt';

function message(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    createdAt: Date.now(),
  };
}

describe('ModularPromptBuilder', () => {
  it('separates stable prompt prefix from dynamic context', () => {
    const builder = new ModularPromptBuilder(
      [
        {
          id: 'identity',
          module: 'core_identity',
          content: 'You are MiniHarness.',
          cacheable: true,
          priority: 100,
        },
        {
          id: 'tools',
          module: 'capabilities',
          content: 'Use tools carefully.',
          cacheable: true,
          priority: 50,
        },
        {
          id: 'task',
          module: 'context_specific',
          content: 'Current task: {{input}}',
          cacheable: false,
          priority: 10,
        },
      ],
      { cacheBoundaryCharacters: 1024 },
    );

    const first = builder.build({ input: 'analyze repo' });
    const second = builder.build({ input: 'write docs' });

    expect(first.prompt).toContain('You are MiniHarness.');
    expect(first.prompt).toContain('Current task: analyze repo');
    expect(second.prompt).toContain('Current task: write docs');
    expect(second.metadata.cacheKey).toBe(first.metadata.cacheKey);
    expect(first.metadata.staticCharacters).toBeGreaterThan(0);
    expect(first.metadata.dynamicCharacters).toBeGreaterThan(0);
    expect(first.metadata.moduleBreakdown.capabilities.sections).toBe(1);
  });
});

describe('ContextBuilder modular prompt integration', () => {
  it('injects prompt cache metadata into the first system message', async () => {
    const store = new InMemoryStore();
    const builder = new ContextBuilder({
      recentLimit: 0,
      searchTopK: 0,
      systemPromptModules: [
        {
          id: 'identity',
          module: 'core_identity',
          content: 'Stable identity.',
          cacheable: true,
          priority: 100,
        },
        {
          id: 'task',
          module: 'context_specific',
          content: 'Task: {{input}} in {{sessionId}}',
          cacheable: false,
          priority: 10,
        },
      ],
    });

    const context = await builder.build(store, 'session_1', message('m1', 'hello'));

    expect(context[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Task: hello in session_1'),
      metadata: {
        promptCacheKey: expect.stringMatching(/^[a-f0-9]{16}$/),
        promptStaticCharacters: expect.any(Number),
        promptDynamicCharacters: expect.any(Number),
      },
    });
  });
});
