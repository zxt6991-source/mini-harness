import type { Tool, ToolContext, ToolResult } from '../../core';

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
