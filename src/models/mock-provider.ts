import type {
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../core';
import { createId } from '../utils/id';

export class MockProvider implements ModelProvider {
  name = 'mock';

  async chat(input: ModelChatInput): Promise<ModelChatOutput> {
    const lastMessage = input.messages.at(-1);

    return {
      message: {
        id: createId('msg'),
        role: 'assistant',
        content: `Mock response: ${lastMessage?.content ?? ''}`,
        createdAt: Date.now(),
      },
    };
  }
}
