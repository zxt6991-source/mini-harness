// 该文件提供内置 echo 工具，用于直接返回输入文本，常用于连通性测试和示例。
import type { Tool, ToolContext, ToolResult } from '../../core';

/** 内置回显工具，直接把输入文本作为工具结果返回。 */
export class EchoTool implements Tool {
  name = 'echo';

  description = 'Return the input text directly.';

  schema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to echo',
      },
    },
    required: ['text'],
  };

  /** 读取输入中的 text 字段并原样返回。 */
  async call(
    input: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const text = typeof input.text === 'string' ? input.text : '';

    return {
      success: true,
      content: text,
    };
  }
}
