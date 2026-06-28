// 该文件在模型输出进入工具调度前执行轻量治理，识别工具幻觉、参数错误和注入风险。
import type { Message, ToolCall, ToolRegistry } from '../core';
import { formatValidationIssues, validateToolInput } from '../tools/validation';
import { suggestToolName } from './hallucination';

export type OutputGovernanceMode = 'throw' | 'observe' | 'self_correct';

export interface OutputGovernanceOptions {
  enabled: boolean;
  mode: OutputGovernanceMode;
  allowUnknownTools?: boolean;
  strictAdditionalProperties?: boolean;
  injectionPatterns?: string[];
}

export interface RejectedToolCall {
  toolCallId: string;
  toolName: string;
  code:
    | 'INVALID_TOOL_CALL'
    | 'UNKNOWN_TOOL'
    | 'INVALID_ARGUMENTS'
    | 'INJECTION_DETECTED';
  message: string;
  suggestion?: string;
}

export interface OutputGovernanceReport {
  passed: boolean;
  acceptedToolCalls: ToolCall[];
  rejectedToolCalls: RejectedToolCall[];
}

/** 模型输出治理器，负责在工具执行前给出可观测的接受/拒绝报告。 */
export class ModelOutputGovernance {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly options: OutputGovernanceOptions,
  ) {}

  get mode(): OutputGovernanceMode {
    return this.options.mode;
  }

  /** 校验 assistant 消息中的全部工具调用，并拆分为可执行和需纠正两组。 */
  validateAssistantMessage(message: Message): OutputGovernanceReport {
    const toolCalls = message.toolCalls ?? [];
    const acceptedToolCalls: ToolCall[] = [];
    const rejectedToolCalls: RejectedToolCall[] = [];

    if (!this.options.enabled) {
      return { passed: true, acceptedToolCalls: toolCalls, rejectedToolCalls };
    }

    for (const toolCall of toolCalls) {
      if (!toolCall.id || !toolCall.name || !isRecord(toolCall.arguments)) {
        rejectedToolCalls.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          code: 'INVALID_TOOL_CALL',
          message: 'Tool call must include id, name, and object arguments.',
        });
        continue;
      }

      const tool = this.registry.get(toolCall.name);
      if (!tool && !this.options.allowUnknownTools) {
        rejectedToolCalls.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          code: 'UNKNOWN_TOOL',
          message: `Tool '${toolCall.name}' is not registered.`,
          suggestion: suggestToolName(
            toolCall.name,
            this.registry.list().map((item) => item.name),
          ),
        });
        continue;
      }

      if (tool) {
        const validation = validateToolInput(tool, toolCall.arguments);
        if (!validation.ok) {
          rejectedToolCalls.push({
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            code: 'INVALID_ARGUMENTS',
            message: formatValidationIssues(validation.issues ?? []),
            suggestion: `Use the schema for '${toolCall.name}' and regenerate arguments.`,
          });
          continue;
        }
      }

      const injection = findInjection(
        toolCall.arguments,
        this.options.injectionPatterns ?? [],
      );
      if (injection) {
        rejectedToolCalls.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          code: 'INJECTION_DETECTED',
          message: `Argument '${injection.path}' contains dangerous pattern '${injection.pattern}'.`,
          suggestion:
            'Remove command, SQL, script, or template injection content from tool arguments.',
        });
        continue;
      }

      acceptedToolCalls.push(toolCall);
    }

    return {
      passed: rejectedToolCalls.length === 0,
      acceptedToolCalls,
      rejectedToolCalls,
    };
  }
}

/** 把治理拒绝结果转换为可反馈给模型的 tool 观察消息。 */
export function createGovernanceObservation(rejection: RejectedToolCall): Message {
  return {
    id: rejection.toolCallId,
    role: 'tool',
    content: [
      `Model output rejected: ${rejection.message}`,
      rejection.suggestion ? `Suggestion: ${rejection.suggestion}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    createdAt: Date.now(),
    metadata: {
      toolCallId: rejection.toolCallId,
      toolName: rejection.toolName,
      success: false,
      errorCode: rejection.code,
      errorName: 'OutputGovernanceError',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findInjection(
  value: unknown,
  patterns: string[],
  path = '$',
): { path: string; pattern: string } | undefined {
  if (typeof value === 'string') {
    const pattern = patterns.find((item) =>
      value.toLowerCase().includes(item.toLowerCase()),
    );
    return pattern ? { path, pattern } : undefined;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const result = findInjection(item, patterns, `${path}[${index}]`);
      if (result) {
        return result;
      }
    }
  }

  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const result = findInjection(item, patterns, `${path}.${key}`);
      if (result) {
        return result;
      }
    }
  }

  return undefined;
}
