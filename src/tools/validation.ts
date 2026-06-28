// 该文件提供轻量工具输入校验，支持工具自定义校验和常用 JSON Schema 子集。
import type {
  Tool,
  ToolInputSchema,
  ToolValidationIssue,
  ToolValidationResult,
} from '../core';

/** 判断未知值是否为普通对象。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 将未知 schema 归一化为对象 schema，避免 provider 收到不可用参数描述。 */
export function normalizeToolSchema(schema: unknown): ToolInputSchema {
  if (isRecord(schema)) {
    return schema;
  }

  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };
}

/** 将校验问题格式化为稳定错误消息。 */
export function formatValidationIssues(issues: ToolValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}

/** 校验一次工具输入，优先使用工具自定义 validateInput 钩子。 */
export function validateToolInput(
  tool: Tool,
  input: Record<string, unknown>,
): ToolValidationResult {
  if (tool.validateInput) {
    return tool.validateInput(input);
  }

  return validateJsonSchemaSubset(normalizeToolSchema(tool.schema), input);
}

/** 校验当前工具层支持的 JSON Schema 子集。 */
function validateJsonSchemaSubset(
  schema: ToolInputSchema,
  input: Record<string, unknown>,
): ToolValidationResult {
  const issues: ToolValidationIssue[] = [];

  if (schema.type && schema.type !== 'object') {
    return { ok: true };
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((field): field is string => typeof field === 'string')
    : [];

  for (const field of required) {
    if (!(field in input)) {
      issues.push({
        path: field,
        message: 'is required',
      });
    }
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};

  for (const [field, value] of Object.entries(input)) {
    const fieldSchema = properties[field];

    if (!fieldSchema) {
      if (schema.additionalProperties === false) {
        issues.push({
          path: field,
          message: 'is not allowed',
        });
      }
      continue;
    }

    if (isRecord(fieldSchema)) {
      issues.push(...validateField(field, value, fieldSchema));
    }
  }

  return {
    ok: issues.length === 0,
    ...(issues.length ? { issues } : {}),
  };
}

/** 校验单个顶层字段的基础 type 和 enum 约束。 */
function validateField(
  path: string,
  value: unknown,
  schema: Record<string, unknown>,
): ToolValidationIssue[] {
  const issues: ToolValidationIssue[] = [];

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    issues.push({
      path,
      message: `must be one of ${schema.enum.map(String).join(', ')}`,
    });
  }

  if (typeof schema.type === 'string' && !matchesJsonSchemaType(value, schema.type)) {
    issues.push({
      path,
      message: `expected ${schema.type}`,
    });
  }

  return issues;
}

/** 判断 JS 值是否匹配常见 JSON Schema type。 */
function matchesJsonSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}
