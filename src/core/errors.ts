export class MiniHarnessError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MiniHarnessError';
  }
}

export class ToolNotFoundError extends MiniHarnessError {
  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND');
  }
}

export class MaxStepsExceededError extends MiniHarnessError {
  constructor(maxSteps: number) {
    super(`Agent loop exceeded maxSteps=${maxSteps}`, 'MAX_STEPS_EXCEEDED');
  }
}

export interface ModelProviderErrorOptions {
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class ModelProviderError extends MiniHarnessError {
  readonly status?: number;
  readonly retryable: boolean;

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
