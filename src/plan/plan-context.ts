/**
 * Plan Mode - Structured Planning System
 *
 * Provides structured planning capabilities:
 * - Enter/Exit plan mode
 * - Plan step management
 * - Plan persistence and history
 * - Integration with the agent system
 */

import { randomUUID } from 'crypto';

/**
 * Plan step status
 */
export type PlanStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'failed';

/**
 * Plan step
 */
export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  dependencies: string[];
  result?: string;
  notes?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Plan status
 */
export type PlanStatus =
  | 'draft'       // Plan is being drafted
  | 'active'      // Plan is being executed
  | 'paused'      // Plan execution is paused
  | 'completed'   // Plan completed successfully
  | 'cancelled'   // Plan was cancelled
  | 'failed';     // Plan execution failed

/**
 * Plan output format
 */
export type PlanOutputFormat = 'markdown' | 'structured' | 'checklist';

/**
 * Plan context
 */
export interface PlanContext {
  id: string;
  goal: string;
  description?: string;
  constraints: string[];
  steps: PlanStep[];
  outputFormat: PlanOutputFormat;
  status: PlanStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  progress?: number; // 0-100
  metadata?: Record<string, unknown>;
}

/**
 * Create a new plan
 */
export function createPlan(
  goal: string,
  options?: {
    description?: string;
    constraints?: string[];
    outputFormat?: PlanOutputFormat;
  }
): PlanContext {
  return {
    id: randomUUID(),
    goal,
    description: options?.description,
    constraints: options?.constraints ?? [],
    steps: [],
    outputFormat: options?.outputFormat ?? 'markdown',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Add a step to a plan
 */
export function addStep(
  plan: PlanContext,
  description: string,
  dependencies?: string[]
): PlanStep {
  const step: PlanStep = {
    id: randomUUID(),
    description,
    status: 'pending',
    dependencies: dependencies ?? [],
    createdAt: new Date(),
  };

  plan.steps.push(step);
  plan.updatedAt = new Date();

  return step;
}

/**
 * Update step status
 */
export function updateStepStatus(
  plan: PlanContext,
  stepId: string,
  status: PlanStepStatus,
  result?: string
): boolean {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step) return false;

  step.status = status;
  if (result) step.result = result;

  if (status === 'completed' || status === 'skipped') {
    step.completedAt = new Date();
  }

  plan.updatedAt = new Date();
  return true;
}

/**
 * Calculate plan progress
 */
export function calculateProgress(plan: PlanContext): number {
  if (plan.steps.length === 0) return 0;

  const completed = plan.steps.filter(
    s => s.status === 'completed' || s.status === 'skipped'
  ).length;

  return Math.round((completed / plan.steps.length) * 100);
}

/**
 * Check if all dependencies are met
 */
export function canExecuteStep(plan: PlanContext, stepId: string): boolean {
  const step = plan.steps.find(s => s.id === stepId);
  if (!step || step.status !== 'pending') return false;

  return step.dependencies.every(depId => {
    const dep = plan.steps.find(s => s.id === depId);
    return dep && (dep.status === 'completed' || dep.status === 'skipped');
  });
}

/**
 * Format plan as markdown
 */
export function formatPlanMarkdown(plan: PlanContext): string {
  const lines: string[] = [];

  lines.push(`# ${plan.goal}`);
  lines.push('');

  if (plan.description) {
    lines.push(plan.description);
    lines.push('');
  }

  if (plan.constraints.length > 0) {
    lines.push('**Constraints:**');
    plan.constraints.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }

  lines.push('## Steps');
  lines.push('');

  plan.steps.forEach((step, index) => {
    const statusIcon = getStatusIcon(step.status);
    lines.push(`${statusIcon} ${index + 1}. ${step.description}`);
    if (step.result) {
      lines.push(`   → ${step.result}`);
    }
  });

  lines.push('');
  lines.push(`**Progress:** ${calculateProgress(plan)}%`);
  lines.push(`**Status:** ${plan.status}`);

  return lines.join('\n');
}

/**
 * Format plan as checklist
 */
export function formatPlanChecklist(plan: PlanContext): string {
  const lines: string[] = [];

  lines.push(`## ${plan.goal}`);
  lines.push('');

  plan.steps.forEach((step, index) => {
    const checkbox = step.status === 'completed' ? '[x]' : '[ ]';
    lines.push(`${checkbox} ${index + 1}. ${step.description}`);
  });

  return lines.join('\n');
}

/**
 * Get status icon
 */
function getStatusIcon(status: PlanStepStatus): string {
  switch (status) {
    case 'pending': return '○';
    case 'in_progress': return '◐';
    case 'completed': return '●';
    case 'skipped': return '✕';
    case 'failed': return '✖';
  }
}

/**
 * Default plan storage directory
 */
export const PLAN_STORAGE_DIR = '.dexter/plans';

/**
 * Get plan file path
 */
export function getPlanFilePath(planId: string): string {
  return `${PLAN_STORAGE_DIR}/${planId}.json`;
}