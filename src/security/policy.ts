// 该文件定义安全策略配置结构，用于约束工具、网络、Shell 和沙箱目录访问。
export interface SecurityPathValidationPolicy {
  enabled?: boolean;
  maxPathLength?: number;
  pathParameterNames?: string[];
}

export interface SecurityCommandGuardrailsPolicy {
  enabled?: boolean;
  dangerousCommands?: string[];
  safeSubcommands?: Record<string, string[]>;
  blockShellControlOperators?: boolean;
  blockInlineExecution?: boolean;
}

export interface SecurityNumericRange {
  min: number;
  max: number;
}

export interface SecurityParameterConstraintsPolicy {
  timeoutMs?: SecurityNumericRange;
  timeout_seconds?: SecurityNumericRange;
  memoryMb?: SecurityNumericRange;
  memory_mb?: SecurityNumericRange;
  fileSizeMb?: SecurityNumericRange;
  file_size_mb?: SecurityNumericRange;
}

export interface SecurityAuditPolicy {
  enabled?: boolean;
}

export interface SecurityPolicy {
  allowTools: string[];
  denyTools: string[];
  sandboxDir: string;
  allowNetwork: boolean;
  allowShell: boolean;
  allowedShellCommands: string[];
  pathValidation?: SecurityPathValidationPolicy;
  commandGuardrails?: SecurityCommandGuardrailsPolicy;
  parameterConstraints?: SecurityParameterConstraintsPolicy;
  audit?: SecurityAuditPolicy;
}
