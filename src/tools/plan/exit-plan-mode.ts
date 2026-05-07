/**
 * ExitPlanMode Tool - Exit structured planning
 *
 * Allows the agent to exit plan mode and either:
 * - Save and start executing the plan
 * - Cancel and discard the plan
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  formatPlanMarkdown,
  formatPlanChecklist,
  calculateProgress,
  PlanContext,
} from '../../plan/plan-context.js';
import {
  getPlanFromMemory,
  listPlans,
  planMemory,
} from './enter-plan-mode.js';

export const EXIT_PLAN_MODE_DESCRIPTION = `
Exit Plan Mode and either save or discard the current plan.

## When to Use

- After creating or modifying a plan
- Ready to start executing the plan
- Want to cancel/abandon the current plan

## Options

- **action**: What to do with the plan:
  - "save": Save the plan and exit (start execution)
  - "discard": Discard the current plan and exit
  - "show": Show the current plan without exiting
- **plan_id**: The plan ID to exit (optional, uses current plan if not specified)

## Actions

- **save**: Saves the plan and enters execution mode. Steps can then be marked complete.
- **discard**: Cancels the current plan, removing it from memory.
- **show**: Displays the current plan status without changing state.

## Example

Exit plan mode and start executing:
- action: "save"

Exit and discard:
- action: "discard"

Show current plan:
- action: "show"
`;

export const ExitPlanModeSchema = z.object({
  action: z.enum(['save', 'discard', 'show']).describe('What to do with the plan'),
  plan_id: z.string().optional().describe('Plan ID (uses current plan if not specified)'),
});

/**
 * Create the ExitPlanMode tool
 */
export function createExitPlanModeTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'exit_plan_mode',
    description: EXIT_PLAN_MODE_DESCRIPTION,
    schema: ExitPlanModeSchema,
    async func(input): Promise<string> {
      const planId = input.plan_id;

      // Get the plan
      let plan: PlanContext | undefined;
      if (planId) {
        plan = getPlanFromMemory(planId);
      } else {
        // Use most recent plan
        const plans = listPlans();
        plan = plans[plans.length - 1];
      }

      if (!plan) {
        return 'No active plan. Use enter_plan_mode first.';
      }

      switch (input.action) {
        case 'show':
          return formatPlan(plan);

        case 'discard':
          planMemory.delete(plan.id);
          return `Plan "${plan.goal}" has been discarded.`;

        case 'save':
          plan.status = 'active';
          return `Plan saved and ready for execution.

${formatPlan(plan)}

You can now start executing steps. Use update_plan_step to mark steps complete.`;

        default:
          return 'Unknown action. Use save, discard, or show.';
      }
    },
  });
}

/**
 * Format plan for display
 */
function formatPlan(plan: PlanContext): string {
  const progress = calculateProgress(plan);
  const stepCount = plan.steps.length;

  const lines: string[] = [];
  lines.push(`**Plan:** ${plan.goal}`);
  lines.push(`**Status:** ${plan.status}`);
  lines.push(`**Progress:** ${progress}% (${stepCount} steps)`);
  lines.push('');

  if (plan.steps.length > 0) {
    lines.push('**Steps:**');
    plan.steps.forEach((step, index) => {
      const status = getStatusEmoji(step.status);
      lines.push(`  ${status} ${index + 1}. ${step.description}`);
    });
  } else {
    lines.push('No steps added yet. Use add_plan_step to add steps.');
  }

  return lines.join('\n');
}

/**
 * Get status emoji
 */
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