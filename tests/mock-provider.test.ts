import { describe, expect, it } from 'vitest';
import { MockProvider } from '../src/models/mock-provider';

describe('MockProvider', () => {
  it('returns an assistant message based on the last input message', async () => {
    const provider = new MockProvider();

    const output = await provider.chat({
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hello',
          createdAt: Date.now(),
        },
      ],
    });

    expect(output.message).toMatchObject({
      role: 'assistant',
      content: 'Mock response: hello',
    });
  });
});
