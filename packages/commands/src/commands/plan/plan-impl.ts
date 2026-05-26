/**
 * Plan Command Implementation
 *
 * Triggers plan mode in the agent.
 */

import type { LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export interface PlanContext extends ToolUseContext {
  state?: {
    inPlanMode?: boolean
    currentPlanId?: string
    planGoal?: string
  }
}

export const call = async (
  args: string,
  _context: PlanContext,
): Promise<LocalCommandResult> => {
  // Check if in plan mode
  let isActive = false
  let planId: string | undefined

  try {
    const { getPlanModeState } = await import('../../../../src/agent/plan-mode-state.js')
    const planMode = getPlanModeState()
    isActive = planMode.isActive()
    planId = planMode.getPlanId()
  } catch {
    // Plan mode not available
  }

  // If in plan mode, show plan status
  if (isActive) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Plan Mode Active
═══════════════════════════════════════

  Plan ID: ${planId?.substring(0, 12) ?? 'N/A'}...

───────────────────────────────────────
  Commands:
    /steps         List plan steps
    /add-step      Add a step to the plan
    /exit-plan     Exit plan mode and execute

───────────────────────────────────────
  Use these commands to manage your plan.

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
    // User provided a goal
    lines.push(`  Goal: ${args.trim()}`)
    lines.push('')

    return {
      type: 'query',
      text: `enter_plan_mode goal="${args.trim()}"`,
    }
  }

  lines.push('  Plan mode helps you structure complex tasks.')
  lines.push('')
  lines.push('───────────────────────────────────────')
  lines.push('  Commands:')
  lines.push('───────────────────────────────────────')
  lines.push('  /plan <goal>    Enter plan mode with goal')
  lines.push('  /steps          List plan steps')
  lines.push('  /add-step      Add a step to plan')
  lines.push('  /exit-plan     Exit and start execution')
  lines.push('')
  lines.push('  Tip: /plan <description> to start planning')

  lines.push('')
  return { type: 'text', value: lines.join('\n') }
}
