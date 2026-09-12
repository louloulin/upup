/**
 * Plan Step Tools - Add and Update Plan Steps
 *
 * Tools for managing individual steps within a plan.
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';
import {
  addStep as addPlanStep,
  updateStepStatus as updatePlanStepStatus,
  canExecuteStep,
  calculateProgress,
  PlanContext,
  PlanStepStatus,
} from '../../plan/plan-context.js';
import {
  getPlanFromMemory,
  listPlans,
} from './enter-plan-mode.js';

// ============= Add Plan Step =============

export const ADD_PLAN_STEP_DESCRIPTION = `
Add a new step to the current plan.

## When to Use

- After entering plan mode
- When you need to add a task/step to the plan
- Breaking down a complex task into smaller steps

## Options

- **description**: What this step does (required)
- **plan_id**: Plan ID (uses current plan if not specified)
- **depends_on**: Array of step IDs this step depends on (optional)
- **notes**: Additional notes or context (optional)

## Example

Add a step to implement authentication:
- description: "Implement JWT token generation"
- depends_on: ["step-id-from-previous-step"] (optional)
`;

export const AddPlanStepSchema = z.object({
  description: z.string().describe('What this step does'),
  plan_id: z.string().optional().describe('Plan ID (uses current plan if not specified)'),
  depends_on: z.array(z.string()).optional().describe('Step IDs this step depends on'),
  notes: z.string().optional().describe('Additional notes or context'),
});

// ============= Update Plan Step =============

export const UPDATE_PLAN_STEP_DESCRIPTION = `
Update the status of a step in the current plan.

## When to Use

- Mark a step as completed
- Mark a step as in_progress
- Mark a step as skipped
- Record the result of a step

## Options

- **step_id**: The step ID to update (required)
- **status**: New status (required)
- **result**: What the step produced (optional)
- **plan_id**: Plan ID (uses current plan if not specified)

## Status Values

- **pending**: Step not started
- **in_progress**: Step is being worked on
- **completed**: Step finished successfully
- **skipped**: Step was skipped
- **failed**: Step failed

## Example

Mark step as completed with result:
- step_id: "step-uuid-123"
- status: "completed"
- result: "JWT token generation implemented with RS256 signing"
`;

export const UpdatePlanStepSchema = z.object({
  step_id: z.string().describe('The step ID to update'),
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']).describe('New status'),
  result: z.string().optional().describe('What the step produced'),
  plan_id: z.string().optional().describe('Plan ID (uses current plan if not specified)'),
});

// ============= List Plan Steps =============

export const LIST_PLAN_STEPS_DESCRIPTION = `
List all steps in the current plan with their status.

## When to Use

- Review the current plan
- Check dependencies between steps
- See overall progress

## Options

- **plan_id**: Plan ID (uses current plan if not specified)

## Example

List all steps in the current plan
`;

export const ListPlanStepsSchema = z.object({
  plan_id: z.string().optional().describe('Plan ID (uses current plan if not specified)'),
});

// ============= Tool Factories =============

function getPlan(planId?: string): PlanContext | undefined {
  if (planId) {
    return getPlanFromMemory(planId);
  }
  const plans = listPlans();
  return plans[plans.length - 1];
}

/**
 * Create the AddPlanStep tool
 */
export function createAddPlanStepTool(): PiTool {
  return new PiTool({
    name: 'add_plan_step',
    description: ADD_PLAN_STEP_DESCRIPTION,
    schema: AddPlanStepSchema,
    async func(input): Promise<string> {
      const plan = getPlan(input.plan_id);

      if (!plan) {
        return 'No active plan. Use enter_plan_mode first.';
      }

      const step = addPlanStep(plan, input.description, input.depends_on);

      return `Step added to plan.

**Step ID:** ${step.id}
**Description:** ${step.description}

${input.depends_on && input.depends_on.length > 0 ? `**Dependencies:** ${input.depends_on.join(', ')}\n` : ''}
${input.notes ? `**Notes:** ${input.notes}\n` : ''}

Total steps: ${plan.steps.length}`;
    },
  });
}

/**
 * Create the UpdatePlanStep tool
 */
export function createUpdatePlanStepTool(): PiTool {
  return new PiTool({
    name: 'update_plan_step',
    description: UPDATE_PLAN_STEP_DESCRIPTION,
    schema: UpdatePlanStepSchema,
    async func(input): Promise<string> {
      const plan = getPlan(input.plan_id);

      if (!plan) {
        return 'No active plan. Use enter_plan_mode first.';
      }

      const success = updatePlanStepStatus(plan, input.step_id, input.status as PlanStepStatus, input.result);

      if (!success) {
        return `Step not found: ${input.step_id}`;
      }

      const progress = calculateProgress(plan);

      return `Step updated.

**Status:** ${input.status}
${input.result ? `**Result:** ${input.result}\n` : ''}
**Progress:** ${progress}%`;
    },
  });
}

/**
 * Create the ListPlanSteps tool
 */
export function createListPlanStepsTool(): PiTool {
  return new PiTool({
    name: 'list_plan_steps',
    description: LIST_PLAN_STEPS_DESCRIPTION,
    schema: ListPlanStepsSchema,
    async func(input): Promise<string> {
      const plan = getPlan(input.plan_id);

      if (!plan) {
        return 'No active plan. Use enter_plan_mode first.';
      }

      const lines: string[] = [];
      lines.push(`**Plan:** ${plan.goal}`);
      lines.push(`**Progress:** ${calculateProgress(plan)}%`);
      lines.push('');
      lines.push('**Steps:**');

      if (plan.steps.length === 0) {
        lines.push('  (No steps yet)');
      } else {
        plan.steps.forEach((step, index) => {
          const status = getStatusEmoji(step.status);
          const depNote = step.dependencies.length > 0
            ? ` [depends on: ${step.dependencies.length} step(s)]`
            : '';
          lines.push(`  ${status} ${index + 1}. ${step.description}${depNote}`);
          if (step.result) {
            lines.push(`      → ${step.result}`);
          }
        });
      }

      return lines.join('\n');
    },
  });
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'pending': return '○';
    case 'in_progress': return '◐';
    case 'completed': return '✅';
    case 'skipped': return '⏭';
    case 'failed': return '❌';
    default: return '○';
  }
}
