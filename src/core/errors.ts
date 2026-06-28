// 该文件定义框架通用错误类型，以及工具、循环步数和模型调用相关的标准错误。
/** MiniHarness 所有自定义错误的基础类，统一携带错误码和原始错误原因。 */
export class MiniHarnessError extends Error {
  /** 创建一个带业务错误码和可选原因的框架错误。 */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MiniHarnessError';
  }
}

/** 表示模型请求了一个未注册工具时抛出的错误。 */
export class ToolNotFoundError extends MiniHarnessError {
  /** 根据缺失的工具名称创建工具不存在错误。 */
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND');
  }
}

/** 表示 Agent 循环超过最大步数仍未得到最终回复的错误。 */
export class MaxStepsExceededError extends MiniHarnessError {
  /** 根据配置的最大步数创建循环超限错误。 */
  constructor(maxSteps: number) {
    super(`Agent loop exceeded maxSteps=${maxSteps}`, 'MAX_STEPS_EXCEEDED');
  }
}

export interface ModelProviderErrorOptions {
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

/** 表示模型提供方调用、解析或校验过程中发生的标准化错误。 */
export class ModelProviderError extends MiniHarnessError {
  readonly status?: number;
  readonly retryable: boolean;

  /** 创建一个包含 HTTP 状态、重试标记和原始原因的模型提供方错误。 */
  constructor(
    message: string,
    code: string,
    options: ModelProviderErrorOptions = {},
  ) {
    super(message, code, options.cause);
    this.name = 'ModelProviderError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
