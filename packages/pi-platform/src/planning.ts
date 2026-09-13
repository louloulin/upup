import { randomUUID } from 'node:crypto';

export type PlatformPlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
export type PlatformPlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type PlatformPlanOutputFormat = 'markdown' | 'structured' | 'checklist';
export type PlatformTodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
export type PlatformTodoPriority = 'low' | 'medium' | 'high';

export interface PlatformPlanStep {
  id: string;
  description: string;
  status: PlatformPlanStepStatus;
  dependencies: string[];
  result?: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
}

export interface PlatformPlan {
  id: string;
  goal: string;
  description?: string;
  constraints: string[];
  steps: PlatformPlanStep[];
  outputFormat: PlatformPlanOutputFormat;
  status: PlatformPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformTodo {
  id: string;
  content: string;
  status: PlatformTodoStatus;
  priority: PlatformTodoPriority;
  notes?: string;
  planId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPlanningState {
  version: 1;
  currentPlanId?: string;
  plans: PlatformPlan[];
  todos: PlatformTodo[];
}

export function createInitialPlatformPlanningState(): PlatformPlanningState {
  return { version: 1, plans: [], todos: [] };
}

export function parsePlatformPlanningState(value: unknown): PlatformPlanningState {
  if (!value || typeof value !== 'object') return createInitialPlatformPlanningState();
  const candidate = value as { version?: unknown; currentPlanId?: unknown; plans?: unknown; todos?: unknown };
  if (candidate.version !== 1 || !Array.isArray(candidate.plans) || !Array.isArray(candidate.todos)) return createInitialPlatformPlanningState();
  const plans = candidate.plans.filter(isPlan).map((plan) => ({ ...plan, steps: plan.steps.map((step) => ({ ...step, dependencies: [...step.dependencies] })), constraints: [...plan.constraints] }));
  const todos = candidate.todos.filter(isTodo).map((todo) => ({ ...todo }));
  const currentPlanId = typeof candidate.currentPlanId === 'string' && plans.some((plan) => plan.id === candidate.currentPlanId) ? candidate.currentPlanId : undefined;
  return { version: 1, ...(currentPlanId ? { currentPlanId } : {}), plans, todos };
}

export function createPlatformPlan(input: { goal: string; description?: string; constraints?: string[]; outputFormat?: PlatformPlanOutputFormat }, now = new Date().toISOString()): PlatformPlan {
  return { id: randomUUID(), goal: input.goal, ...(input.description ? { description: input.description } : {}), constraints: input.constraints ?? [], steps: [], outputFormat: input.outputFormat ?? 'markdown', status: 'draft', createdAt: now, updatedAt: now };
}

export function addPlatformPlanStep(plan: PlatformPlan, input: { description: string; dependsOn?: string[]; notes?: string }, now = new Date().toISOString()): PlatformPlanStep {
  const dependencies = input.dependsOn ?? [];
  if (dependencies.some((id) => !plan.steps.some((step) => step.id === id))) throw new Error('plan step dependency does not exist');
  if (dependencies.includes(plan.id)) throw new Error('plan step dependency is invalid');
  const step: PlatformPlanStep = { id: randomUUID(), description: input.description, status: 'pending', dependencies, ...(input.notes ? { notes: input.notes } : {}), createdAt: now };
  plan.steps.push(step);
  plan.updatedAt = now;
  return step;
}

export function updatePlatformPlanStep(plan: PlatformPlan, stepId: string, status: PlatformPlanStepStatus, result?: string, now = new Date().toISOString()): boolean {
  const step = plan.steps.find((candidate) => candidate.id === stepId);
  if (!step) return false;
  step.status = status;
  if (result !== undefined) step.result = result;
  if (status === 'completed' || status === 'skipped') step.completedAt = now;
  else delete step.completedAt;
  plan.updatedAt = now;
  return true;
}

export function platformPlanProgress(plan: PlatformPlan): number {
  if (plan.steps.length === 0) return 0;
  return Math.round((plan.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length / plan.steps.length) * 100);
}

export function getPlatformPlan(state: PlatformPlanningState, planId?: string): PlatformPlan | undefined {
  const id = planId ?? state.currentPlanId;
  if (id) return state.plans.find((plan) => plan.id === id);
  return state.plans.at(-1);
}

export function createPlatformTodo(input: { content: string; planId?: string; priority?: PlatformTodoPriority; notes?: string }, now = new Date().toISOString()): PlatformTodo {
  return { id: randomUUID(), content: input.content, status: 'pending', priority: input.priority ?? 'medium', ...(input.notes ? { notes: input.notes } : {}), ...(input.planId ? { planId: input.planId } : {}), createdAt: now, updatedAt: now };
}

export function updatePlatformTodo(state: PlatformPlanningState, todoId: string, updates: Partial<Pick<PlatformTodo, 'content' | 'status' | 'priority' | 'notes'>>, planId?: string, now = new Date().toISOString()): PlatformTodo | undefined {
  const todo = state.todos.find((candidate) => candidate.id === todoId && candidate.planId === planId);
  if (!todo) return undefined;
  if (updates.content !== undefined) todo.content = updates.content;
  if (updates.status !== undefined) todo.status = updates.status;
  if (updates.priority !== undefined) todo.priority = updates.priority;
  if (updates.notes !== undefined) todo.notes = updates.notes;
  todo.updatedAt = now;
  return todo;
}

export function listPlatformTodos(state: PlatformPlanningState, planId?: string, status?: PlatformTodoStatus): PlatformTodo[] {
  return state.todos.filter((todo) => todo.planId === planId && (status === undefined || todo.status === status)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deletePlatformTodo(state: PlatformPlanningState, todoId: string, planId?: string): PlatformTodo | undefined {
  const index = state.todos.findIndex((candidate) => candidate.id === todoId && candidate.planId === planId);
  if (index < 0) return undefined;
  return state.todos.splice(index, 1)[0];
}

export function platformTodoStats(todos: readonly PlatformTodo[]): { total: number; pending: number; inProgress: number; completed: number; failed: number } {
  return { total: todos.length, pending: todos.filter((todo) => todo.status === 'pending').length, inProgress: todos.filter((todo) => todo.status === 'in_progress').length, completed: todos.filter((todo) => todo.status === 'completed').length, failed: todos.filter((todo) => todo.status === 'failed' || todo.status === 'cancelled').length };
}

function isPlan(value: unknown): value is PlatformPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<PlatformPlan>;
  return typeof plan.id === 'string' && typeof plan.goal === 'string' && Array.isArray(plan.constraints) && Array.isArray(plan.steps) && typeof plan.createdAt === 'string' && typeof plan.updatedAt === 'string';
}

function isTodo(value: unknown): value is PlatformTodo {
  if (!value || typeof value !== 'object') return false;
  const todo = value as Partial<PlatformTodo>;
  return typeof todo.id === 'string' && typeof todo.content === 'string' && typeof todo.status === 'string' && typeof todo.priority === 'string' && typeof todo.createdAt === 'string' && typeof todo.updatedAt === 'string';
}
