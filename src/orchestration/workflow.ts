// 该文件定义工作流状态机的声明式 TypeScript 类型。
export type WorkflowStateType =
  | 'initial'
  | 'normal'
  | 'parallel'
  | 'wait'
  | 'approval'
  | 'final'
  | 'error';

export interface WorkflowContext {
  values: Map<string, unknown>;
  taskResults: Map<string, unknown>;
}

export type WorkflowCondition = (ctx: WorkflowContext) => boolean;

export interface WorkflowAction {
  id: string;
  type: 'noop' | 'set_variable' | 'log';
  params?: Record<string, unknown>;
  sideEffect?: boolean;
}

export interface WorkflowStateDefinition {
  id: string;
  type: WorkflowStateType;
  description?: string;
  taskIds?: string[];
  actions?: WorkflowAction[];
  timeoutMs?: number;
}

export interface WorkflowTransitionDefinition {
  from: string;
  to: string;
  condition?: WorkflowCondition;
  priority?: number;
}

export interface WorkflowErrorHandler {
  onState: string;
  errorCode?: string;
  fallbackState: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  initialState: string;
  states: WorkflowStateDefinition[];
  transitions: WorkflowTransitionDefinition[];
  errorHandlers?: WorkflowErrorHandler[];
}

export interface WorkflowHistoryEntry {
  timestamp: number;
  stateId: string;
  event: 'state_entry' | 'state_exit';
  contextSnapshot: Record<string, unknown>;
}

