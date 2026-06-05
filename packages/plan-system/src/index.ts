/**
 * @upup/plan-system - L4 Plan System
 *
 * Plan mode, task planning, and workflow orchestration.
 * Replaces src/plan/ and src/tasks/.
 */

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Plan {
  id: string;
  title: string;
  description?: string;
  steps: PlanStep[];
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'active' | 'completed' | 'abandoned';
}

export interface PlanModeState {
  enabled: boolean;
  currentPlanId?: string;
  autoApprove: boolean;
}

let _state: PlanModeState = { enabled: false, autoApprove: false };
export function getPlanModeState(): PlanModeState { return _state; }
export function setPlanModeState(s: Partial<PlanModeState>): void { _state = { ..._state, ...s }; }

export async function createPlan(_title: string, _steps: Omit<PlanStep, 'id' | 'status'>[]): Promise<Plan> {
  return {
    id: `plan-${Date.now()}`,
    title: _title,
    steps: _steps.map((s, i) => ({ ...s, id: `step-${i}`, status: 'pending' as PlanStepStatus })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'draft',
  };
}

export async function executePlan(_plan: Plan): Promise<Plan> {
  return { ..._plan, status: 'completed', updatedAt: Date.now() };
}
