export type PlatformWorkflowErrorPolicy = 'skip' | 'abort' | 'retry';

export interface PlatformWorkflowStep {
  readonly name: string;
  readonly tool: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly condition?: string;
  readonly onError?: PlatformWorkflowErrorPolicy;
}

export interface PlatformWorkflowPlan {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly PlatformWorkflowStep[];
  readonly stopOnError: boolean;
  readonly status: 'planned';
  readonly createdAt: number;
}

export interface PlatformWorkflowState {
  readonly schema: 1;
  readonly plans: readonly PlatformWorkflowPlan[];
}

const MAX_PLANS = 100;
const ERROR_POLICIES: readonly PlatformWorkflowErrorPolicy[] = ['skip', 'abort', 'retry'];

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === 'string';
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseStep(value: unknown): PlatformWorkflowStep | undefined {
  if (!record(value) || !stringValue(value.name) || !stringValue(value.tool) || !record(value.input)) return undefined;
  if (value.condition !== undefined && !stringValue(value.condition)) return undefined;
  if (value.onError !== undefined && !ERROR_POLICIES.includes(value.onError as PlatformWorkflowErrorPolicy)) return undefined;
  return {
    name: value.name,
    tool: value.tool,
    input: value.input,
    ...(value.condition === undefined ? {} : { condition: value.condition }),
    ...(value.onError === undefined ? {} : { onError: value.onError as PlatformWorkflowErrorPolicy }),
  };
}

function parsePlan(value: unknown): PlatformWorkflowPlan | undefined {
  if (!record(value) || !stringValue(value.id) || !stringValue(value.name) || value.status !== 'planned' || typeof value.stopOnError !== 'boolean' || !integer(value.createdAt) || !Array.isArray(value.steps)) return undefined;
  const steps = value.steps.map(parseStep);
  if (steps.some((step) => step === undefined) || steps.length === 0) return undefined;
  return { id: value.id, name: value.name, steps: steps as PlatformWorkflowStep[], stopOnError: value.stopOnError, status: 'planned', createdAt: value.createdAt };
}

export function createInitialPlatformWorkflowState(): PlatformWorkflowState {
  return { schema: 1, plans: [] };
}

export function parsePlatformWorkflowState(value: unknown): PlatformWorkflowState {
  if (!record(value) || value.schema !== 1 || !Array.isArray(value.plans)) return createInitialPlatformWorkflowState();
  return { schema: 1, plans: value.plans.map(parsePlan).filter((plan): plan is PlatformWorkflowPlan => plan !== undefined).slice(-MAX_PLANS) };
}

export function addPlatformWorkflowPlan(state: PlatformWorkflowState, plan: PlatformWorkflowPlan): PlatformWorkflowState {
  return { schema: 1, plans: [...state.plans, plan].slice(-MAX_PLANS) };
}

export function createPlatformWorkflowPlan(input: {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly PlatformWorkflowStep[];
  readonly stopOnError: boolean;
  readonly createdAt?: number;
}): PlatformWorkflowPlan {
  return { id: input.id, name: input.name, steps: input.steps, stopOnError: input.stopOnError, status: 'planned', createdAt: input.createdAt ?? Date.now() };
}
