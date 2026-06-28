// 该文件提供简单规划器，把用户目标或显式步骤转换为可执行任务列表。
import type { Task } from './task';

export interface PlanStep {
  id?: string;
  title: string;
  description?: string;
  dependsOn?: string[];
  role?: string;
}

export interface PlanInput {
  goal: string;
  steps?: PlanStep[];
}

/** 简单任务规划器，把目标或显式步骤转换成待执行任务。 */
export class SimplePlanner {
  /** 根据输入目标生成任务列表，没有显式步骤时生成单任务计划。 */
  async plan(input: PlanInput): Promise<Task[]> {
    const steps =
      input.steps && input.steps.length > 0
        ? input.steps
        : [{ title: input.goal, description: input.goal }];

    return steps.map((step, index) => ({
      id: step.id ?? `task_${index + 1}`,
      title: step.title,
      description: step.description ?? step.title,
      status: 'pending',
      role: step.role ?? 'default',
      dependsOn: step.dependsOn ?? [],
    }));
  }
}
