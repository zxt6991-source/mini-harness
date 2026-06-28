import { describe, expect, it } from 'vitest';
import type { Message } from '../src/core';
import {
  createGovernanceObservation,
  ModelOutputGovernance,
} from '../src/models/output-governance';
import { EchoTool } from '../src/tools/builtin/echo';
import { DefaultToolRegistry } from '../src/tools/registry';

function assistant(toolCalls: Message['toolCalls']): Message {
  return {
    id: 'assistant_1',
    role: 'assistant',
    content: '',
    toolCalls,
    createdAt: Date.now(),
  };
}

describe('ModelOutputGovernance', () => {
  it('passes registered tool calls with valid arguments', () => {
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const gate = new ModelOutputGovernance(registry, {
      enabled: true,
      mode: 'throw',
    });

    const report = gate.validateAssistantMessage(
      assistant([{ id: 'call_1', name: 'echo', arguments: { text: 'hello' } }]),
    );

    expect(report.passed).toBe(true);
    expect(report.acceptedToolCalls).toHaveLength(1);
    expect(report.rejectedToolCalls).toHaveLength(0);
  });

  it('rejects unknown tools with a correction suggestion', () => {
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const gate = new ModelOutputGovernance(registry, {
      enabled: true,
      mode: 'observe',
    });

    const report = gate.validateAssistantMessage(
      assistant([{ id: 'call_1', name: 'ech', arguments: { text: 'hello' } }]),
    );

    expect(report.passed).toBe(false);
    expect(report.rejectedToolCalls[0]).toMatchObject({
      toolCallId: 'call_1',
      toolName: 'ech',
      code: 'UNKNOWN_TOOL',
    });
    expect(report.rejectedToolCalls[0]?.suggestion).toContain('echo');
  });

  it('rejects invalid tool arguments before execution', () => {
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const gate = new ModelOutputGovernance(registry, {
      enabled: true,
      mode: 'observe',
    });

    const report = gate.validateAssistantMessage(
      assistant([{ id: 'call_1', name: 'echo', arguments: {} }]),
    );

    expect(report.passed).toBe(false);
    expect(report.rejectedToolCalls[0]?.code).toBe('INVALID_ARGUMENTS');
  });

  it('rejects string arguments containing injection patterns', () => {
    const registry = new DefaultToolRegistry();
    registry.register(new EchoTool());
    const gate = new ModelOutputGovernance(registry, {
      enabled: true,
      mode: 'observe',
      injectionPatterns: ['rm -rf'],
    });

    const report = gate.validateAssistantMessage(
      assistant([{ id: 'call_1', name: 'echo', arguments: { text: 'rm -rf /' } }]),
    );

    expect(report.passed).toBe(false);
    expect(report.rejectedToolCalls[0]?.code).toBe('INJECTION_DETECTED');
  });

  it('creates tool observations for rejected calls', () => {
    const message = createGovernanceObservation({
      toolCallId: 'call_1',
      toolName: 'missing',
      code: 'UNKNOWN_TOOL',
      message: "Tool 'missing' is not registered.",
      suggestion: "Use 'echo' instead of 'missing'.",
    });

    expect(message).toMatchObject({
      id: 'call_1',
      role: 'tool',
      metadata: {
        toolCallId: 'call_1',
        toolName: 'missing',
        success: false,
        errorCode: 'UNKNOWN_TOOL',
        errorName: 'OutputGovernanceError',
      },
    });
    expect(message.content).toContain("Tool 'missing' is not registered.");
    expect(message.content).toContain("Use 'echo' instead of 'missing'.");
  });
});
