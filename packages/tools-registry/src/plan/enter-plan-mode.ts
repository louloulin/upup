/**
 * EnterPlanMode Tool - Start structured planning
 *
 * Allows the agent to enter plan mode for complex tasks.
 * Shows available plan functionality and guidance.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  createPlan,
  addStep,
  PLAN_STORAGE_DIR,
} from '@upup/plan-system/plan/plan-context';
import { getPlanModeState } from '@upup/agent-runtime/plan-mode-state';

export const ENTER_PLAN_MODE_DESCRIPTION = `
Enter Plan Mode to create a structured plan for a complex task.

## When to Use

- Task is complex and requires multiple steps
- Need to break down a large task into manageable parts
- Want to track progress and dependencies between steps
- Need to plan before executing (like "/plan" in Claude Code)

## How It Works

1. Enter plan mode with a goal/objective
2. The system creates a plan with steps
3. Each step can have dependencies on previous steps
4. Track progress as you work through the plan
5. Exit plan mode when complete or to begin execution

## Options

- **goal**: What you want to accomplish (required)
- **description**: Optional description of the plan
- **constraints**: List of constraints or requirements
- **output_format**: How to format the plan output (markdown, structured, checklist)

## Example

Enter plan mode to refactor the authentication system:
- Goal: "Refactor authentication system to use JWT"
- Constraints: ["Maintain backward compatibility", "No breaking changes to API"]
- Output: structured plan with steps

Use ExitPlanMode when done planning.
`;

export const EnterPlanModeSchema = z.object({
  goal: z.string().describe('The objective or goal to accomplish'),
  description: z.string().optional().describe('Optional description of what this plan should achieve'),
  constraints: z.array(z.string()).optional().describe('List of constraints or requirements'),
  output_format: z.enum(['markdown', 'structured', 'checklist']).optional().describe('Output format for the plan'),
});

/**
 * Create the EnterPlanMode tool
 */
export function createEnterPlanModeTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'enter_plan_mode',
    description: ENTER_PLAN_MODE_DESCRIPTION,
    schema: EnterPlanModeSchema,
    async func(input): Promise<string> {
      const plan = createPlan(input.goal, {
        description: input.description,
        constraints: input.constraints,
        outputFormat: input.output_format as 'markdown' | 'structured' | 'checklist' | undefined,
      });

      // Store plan in memory for session
      planMemory.set(plan.id, plan);

      // Enter plan mode state (blocks non-plan tools)
      const planModeState = getPlanModeState();
      planModeState.enter(plan.id);

      // Create storage directory if needed
      try {
        const { mkdirSync, existsSync } = await import('fs');
        if (!existsSync(PLAN_STORAGE_DIR)) {
          mkdirSync(PLAN_STORAGE_DIR, { recursive: true });
        }
      } catch {
        // Ignore if can't create directory
      }

      return `Entered Plan Mode.

**Plan ID:** ${plan.id}
**Goal:** ${plan.goal}

${plan.description ? `**Description:** ${plan.description}\n` : ''}
${plan.constraints.length > 0 ? `**Constraints:**\n${plan.constraints.map(c => `- ${c}`).join('\n')}\n` : ''}

**Status:** Draft - Add steps to build your plan.

Use add_plan_step to add steps, then exit_plan_mode when ready.
`;
    },
  });
}

/**
 * In-memory plan storage
 */
export const planMemory = new Map<string, ReturnType<typeof createPlan>>();

/**
 * Get plan from memory
 */
export function getPlanFromMemory(planId: string) {
  return planMemory.get(planId);
}

/**
 * List all plans in memory
 */
export function listPlans(): ReturnType<typeof createPlan>[] {
  return Array.from(planMemory.values());
}