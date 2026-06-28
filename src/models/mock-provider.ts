// 该文件提供模拟模型实现，用于无外部 API 时返回可预测的测试响应。
import type {
  ModelChatInput,
  ModelChatOutput,
  ModelProvider,
} from '../core';
import { createId } from '../utils/id';

/** 模拟模型提供方，用于测试和本地演示时生成固定格式的 assistant 回复。 */
export class MockProvider implements ModelProvider {
  name = 'mock';

  /** 根据最后一条输入消息生成一条 mock 响应。 */
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
