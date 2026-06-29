// 该文件实现 workflow 有限状态机，负责状态定义校验和条件转移。
import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowHistoryEntry,
  WorkflowStateDefinition,
  WorkflowTransitionDefinition,
} from './workflow';

function mapToRecord(map: ReadonlyMap<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(map.entries());
}

/** 工作流状态机，维护 current state、context 和转移历史。 */
export class WorkflowStateMachine {
  private readonly states = new Map<string, WorkflowStateDefinition>();
  private readonly transitions: WorkflowTransitionDefinition[];
  private context: WorkflowContext = {
    values: new Map(),
    taskResults: new Map(),
  };
  private currentState: WorkflowStateDefinition | undefined;
  readonly history: WorkflowHistoryEntry[] = [];

  /** 构造并校验 workflow definition。 */
  constructor(readonly definition: WorkflowDefinition) {
    for (const state of definition.states) {
      if (this.states.has(state.id)) {
        throw new Error(`Duplicate workflow state: ${state.id}`);
      }

      this.states.set(state.id, state);
    }

    const initialStates = definition.states.filter((state) => state.type === 'initial');
    if (
      initialStates.length !== 1 ||
      initialStates[0]?.id !== definition.initialState
    ) {
      throw new Error('Workflow must define exactly one initial state');
    }

    for (const transition of definition.transitions) {
      if (!this.states.has(transition.from)) {
        throw new Error(`Transition references missing from state: ${transition.from}`);
      }
      if (!this.states.has(transition.to)) {
        throw new Error(`Transition references missing to state: ${transition.to}`);
      }
    }

    this.transitions = [...definition.transitions].sort(
      (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
    );
  }

  /** 当前状态 ID。 */
  get currentStateId(): string | undefined {
    return this.currentState?.id;
  }

  /** 当前 workflow context。 */
  get workflowContext(): WorkflowContext {
    return this.context;
  }

  /** 初始化状态机。 */
  initialize(values: Record<string, unknown> = {}): void {
    this.context = {
      values: new Map(Object.entries(values)),
      taskResults: new Map(),
    };
    this.history.length = 0;
    this.currentState = this.mustGetState(this.definition.initialState);
    this.log('state_entry', this.currentState.id);
  }

  /** 找到满足条件的下一状态 ID。 */
  findNextState(): string | undefined {
    if (!this.currentState) {
      return undefined;
    }

    for (const transition of this.transitions) {
      if (transition.from !== this.currentState.id) {
        continue;
      }

      if (!transition.condition || transition.condition(this.context)) {
        return transition.to;
      }
    }

    return undefined;
  }

  /** 转移到下一状态并返回新状态 ID。 */
  transitionToNext(): string | undefined {
    const nextState = this.findNextState();
    if (!nextState) {
      return undefined;
    }

    this.transition(nextState);
    return nextState;
  }

  /** 显式转移到指定状态。 */
  transition(stateId: string): void {
    if (this.currentState) {
      this.log('state_exit', this.currentState.id);
    }

    this.currentState = this.mustGetState(stateId);
    this.log('state_entry', stateId);
  }

  /** 当前状态是否为 final。 */
  isFinal(): boolean {
    return this.currentState?.type === 'final';
  }

  /** 当前状态是否为 error。 */
  isError(): boolean {
    return this.currentState?.type === 'error';
  }

  /** 获取当前状态定义。 */
  getCurrentState(): WorkflowStateDefinition | undefined {
    return this.currentState;
  }

  private mustGetState(stateId: string): WorkflowStateDefinition {
    const state = this.states.get(stateId);
    if (!state) {
      throw new Error(`Workflow state not found: ${stateId}`);
    }

    return state;
  }

  private log(event: WorkflowHistoryEntry['event'], stateId: string): void {
    this.history.push({
      timestamp: Date.now(),
      event,
      stateId,
      contextSnapshot: {
        values: mapToRecord(this.context.values),
        taskResults: mapToRecord(this.context.taskResults),
      },
    });
  }
}

