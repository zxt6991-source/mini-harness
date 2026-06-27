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

function createUserMessage(input: string): Message {
  return {
    id: createId('msg'),
    role: 'user',
    content: input,
    createdAt: Date.now(),
  };
}

export class Engine {
  constructor(
    private readonly model: ModelProvider,
    private readonly memory: Memory,
    private readonly tools: ToolRegistry,
    private readonly options: EngineOptions,
  ) {}

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
