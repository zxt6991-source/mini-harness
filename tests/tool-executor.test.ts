import { describe, expect, it, vi } from 'vitest';
import type { Tool, ToolContext, ToolResult } from '../src/core';
import { SecurityGuard } from '../src/security/guard';
import { ToolExecutor } from '../src/tools/executor';

const ctx: ToolContext = {
  traceId: 'trace_1',
  sessionId: 'session_1',
};

function createExecutor() {
  return new ToolExecutor(
    new SecurityGuard({
      allowTools: [],
      denyTools: [],
      sandboxDir: '.',
      allowNetwork: true,
      allowShell: true,
      allowedShellCommands: [],
    }),
  );
}

describe('ToolExecutor pipeline', () => {
  it('validates required JSON schema fields before calling the tool', async () => {
    const call = vi.fn(async (): Promise<ToolResult> => ({
      success: true,
      content: 'called',
    }));
    const tool: Tool = {
      name: 'needs_text',
      description: 'Needs text',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
      call,
    };

    await expect(createExecutor().execute(tool, {}, ctx)).rejects.toMatchObject({
      code: 'TOOL_VALIDATION_ERROR',
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('uses custom tool validators before schema fallback', async () => {
    const call = vi.fn(async (): Promise<ToolResult> => ({
      success: true,
      content: 'called',
    }));
    const tool = {
      name: 'custom_validate',
      description: 'Custom validate',
      schema: { type: 'object' },
      validateInput: () => ({
        ok: false,
        issues: [{ path: 'mode', message: 'mode is unsupported' }],
      }),
      call,
    } as Tool & {
      validateInput: () => {
        ok: boolean;
        issues: Array<{ path: string; message: string }>;
      };
    };

    await expect(createExecutor().execute(tool, {}, ctx)).rejects.toMatchObject({
      code: 'TOOL_VALIDATION_ERROR',
      message: expect.stringContaining('mode is unsupported'),
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('validates numeric ranges from JSON schema before calling the tool', async () => {
    const call = vi.fn(async (): Promise<ToolResult> => ({
      success: true,
      content: 'called',
    }));
    const tool: Tool = {
      name: 'range',
      description: 'Range',
      schema: {
        type: 'object',
        properties: {
          count: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['count'],
      },
      call,
    };

    await expect(
      createExecutor().execute(tool, { count: 10 }, ctx),
    ).rejects.toMatchObject({
      code: 'TOOL_VALIDATION_ERROR',
      message: expect.stringContaining('must be <= 5'),
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('validates string length and pattern from JSON schema before calling the tool', async () => {
    const call = vi.fn(async (): Promise<ToolResult> => ({
      success: true,
      content: 'called',
    }));
    const tool: Tool = {
      name: 'slug',
      description: 'Slug',
      schema: {
        type: 'object',
        properties: {
          value: {
            type: 'string',
            minLength: 3,
            maxLength: 8,
            pattern: '^[a-z]+$',
          },
        },
        required: ['value'],
      },
      call,
    };

    await expect(
      createExecutor().execute(tool, { value: 'AB' }, ctx),
    ).rejects.toMatchObject({
      code: 'TOOL_VALIDATION_ERROR',
      message: expect.stringContaining('length must be >= 3'),
    });
    expect(call).not.toHaveBeenCalled();
  });

  it(
    'times out slow tools using the tool context timeout',
    async () => {
      const tool: Tool = {
        name: 'slow',
        description: 'Slow',
        schema: { type: 'object' },
        call: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { success: true, content: 'late' };
        },
      };

      await expect(
        createExecutor().execute(tool, {}, { ...ctx, timeoutMs: 5 }),
      ).rejects.toMatchObject({
        code: 'TOOL_TIMEOUT',
        message: 'Tool timed out after 5ms',
      });
    },
    500,
  );

  it('normalizes and truncates oversized tool results', async () => {
    const tool = {
      name: 'large',
      description: 'Large',
      schema: { type: 'object' },
      capability: {
        maxResultCharacters: 4,
      },
      call: async () => ({
        success: true,
        content: 'abcdefghij',
      }),
    } as Tool & { capability: { maxResultCharacters: number } };

    await expect(createExecutor().execute(tool, {}, ctx)).resolves.toEqual({
      success: true,
      content: 'abcd\n... [output truncated from 10 characters]',
      metadata: expect.objectContaining({
        truncated: true,
        originalLength: 10,
        maxResultCharacters: 4,
        toolName: 'large',
      }),
    });
  });
});
