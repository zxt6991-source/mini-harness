// 该文件实现 Agent 主循环，负责串联模型、记忆和工具调用直到生成最终回复。
import type {
  Memory,
  Message,
  ModelProvider,
  ToolRegistry,
} from '../core';
import { MaxStepsExceededError } from '../core';
import { createId } from '../utils/id';

export interface EngineOptions {
  maxSteps: number;
  requestTimeoutMs: number;
  enableStream: boolean;
}

/** 把用户输入文本包装成内部统一的 user 消息对象。 */
function createUserMessage(input: string): Message {
  return {
    id: createId('msg'),
    role: 'user',
    content: input,
    createdAt: Date.now(),
  };
}

/** Agent 运行时引擎，负责驱动模型回复、工具调用和记忆写入的完整循环。 */
export class Engine {
  /** 注入模型、记忆、工具注册表和运行选项，创建一个可执行的引擎实例。 */
  constructor(
    private readonly model: ModelProvider,
    private readonly memory: Memory,
    private readonly tools: ToolRegistry,
    private readonly options: EngineOptions,
  ) {}

  /** 执行一次用户输入，持续处理模型工具调用，直到返回最终 assistant 消息。 */
  async run(input: string, sessionId: string): Promise<Message> {
    const userMessage = createUserMessage(input);

    await this.memory.save(sessionId, userMessage);

    const messages = await this.memory.buildContext(sessionId, userMessage);

    for (let step = 0; step < this.options.maxSteps; step++) {
      const output = await this.model.chat({
        messages,
        tools: this.tools.list(),
        options: {
          timeoutMs: this.options.requestTimeoutMs,
        },
        metadata: {
          traceId: userMessage.id,
          sessionId,
        },
      });

      const assistantMessage = output.message;

      if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
        await this.memory.save(sessionId, assistantMessage);
        return assistantMessage;
      }

      messages.push(assistantMessage);
      await this.memory.save(sessionId, assistantMessage);

      for (const toolCall of assistantMessage.toolCalls) {
        const resultMessage = await this.tools.execute(toolCall, {
          traceId: assistantMessage.id,
          sessionId,
        });

        messages.push(resultMessage);
        await this.memory.save(sessionId, resultMessage);
      }
    }

    throw new MaxStepsExceededError(this.options.maxSteps);
  }
}
