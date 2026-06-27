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

export class SimplePlanner {
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
