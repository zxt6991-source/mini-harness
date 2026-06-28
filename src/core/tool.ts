// 该文件定义工具、工具结果、执行上下文和工具注册表接口，供模型调用外部能力。
import type { Message, ToolCall } from './message';

export type JsonObject = Record<string, unknown>;
export type ToolInputSchema = JsonObject;

export type ToolCategory =
  | 'builtin'
  | 'execution'
  | 'file'
  | 'network'
  | 'agent'
  | 'domain'
  | 'mcp';

export type ToolAccessLevel = 'system' | 'admin' | 'trusted' | 'public';

export interface ToolValidationIssue {
  path: string;
  message: string;
}

export interface ToolValidationResult {
  ok: boolean;
  issues?: ToolValidationIssue[];
}

export interface ToolProgress {
  step: number;
  totalSteps: number;
  status: string;
  estimatedTimeRemainingMs?: number;
}

export interface ToolCapability {
  name: string;
  description: string;
  schema: ToolInputSchema;
  category: ToolCategory;
  accessLevel: ToolAccessLevel;
  source: 'builtin' | 'mcp' | 'custom';
  version?: string;
  timeoutMs?: number;
  cacheable?: boolean;
  maxResultCharacters?: number;
  requiredPermissions?: string[];
  examples?: Array<Record<string, unknown>>;
  limitations?: string[];
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  content: string;
  metadata?: Record<string, unknown>;
  errorCode?: string;
  errorName?: string;
}

export interface ToolContext {
  traceId: string;
  sessionId: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  reportProgress?: (progress: ToolProgress) => void;
}

export interface Tool {
  name: string;
  description: string;
  schema: unknown;
  capability?: Partial<Omit<ToolCapability, 'name' | 'description' | 'schema'>>;
  validateInput?(input: Record<string, unknown>): ToolValidationResult;
  call(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  listCapabilities(): ToolCapability[];
  getCapability(name: string): ToolCapability | undefined;
  unregister(name: string): boolean;
  execute(toolCall: ToolCall, ctx: ToolContext): Promise<Message>;
}
