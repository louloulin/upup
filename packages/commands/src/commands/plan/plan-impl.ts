/**
 * Plan Command Implementation
 *
 * Triggers plan mode in the agent using enter_plan_mode tool.
 * The actual plan mode entry is handled by the agent runner.
 */

import type { LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export interface PlanContext extends ToolUseContext {
  state?: {
    inPlanMode?: boolean
    currentPlanId?: string
    planGoal?: string
  }
  // For triggering plan mode via agent
  triggerPlanMode?: (goal: string) => Promise<void>
}

export const call = async (
  args: string,
  context: PlanContext,
): Promise<LocalCommandResult> => {
  const state = context.state ?? {}
  const inPlanMode = state.inPlanMode ?? false
  const currentPlanId = state.currentPlanId
  const planGoal = state.planGoal

  // If in plan mode, show plan status
  if (inPlanMode && currentPlanId) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Plan Mode Active
═══════════════════════════════════════

  Plan ID: ${currentPlanId.substring(0, 12)}...
  Goal: ${planGoal ?? 'Unknown'}

───────────────────────────────────────
  Commands:
    /steps          List plan steps
    /add-step       Add a step to the plan
    /exit-plan      Exit plan mode

───────────────────────────────────────
  Tip: Use the agent to manage your plan.
  Add steps, then exit when ready to execute.

`,
    }
  }

  // Not in plan mode
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Plan Mode',
    '═══════════════════════════════════════',
    '',
  ]

  if (args.trim()) {
    // User provided a goal - suggest to trigger plan mode
    lines.push('  Goal: ' + args.trim())
    lines.push('')
    lines.push('  To enter plan mode with this goal,')
    lines.push('  use the agent tool: /plan <goal>')
    lines.push('')
    lines.push('───────────────────────────────────────')
    lines.push('  Commands:')
    lines.push('───────────────────────────────────────')
    lines.push('  /plan <goal>    Enter plan mode with goal')
    lines.push('  /steps          List plan steps')
    lines.push('  /add-step       Add a step to plan')
  } else {
    lines.push('  Plan mode helps you structure complex tasks.')
    lines.push('')
    lines.push('───────────────────────────────────────')
    lines.push('  Commands:')
    lines.push('───────────────────────────────────────')
    lines.push('  /plan <goal>    Enter plan mode with goal')
    lines.push('  /steps          List plan steps')
    lines.push('  /add-step       Add a step to plan')
    lines.push('')
    lines.push('  Tip: Plan mode blocks non-planning tools')
    lines.push('  until you exit with /exit-plan')
  }

  lines.push('')
  return { type: 'text', value: lines.join('\n') }
}