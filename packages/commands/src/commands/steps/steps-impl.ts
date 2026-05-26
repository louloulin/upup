/**
 * Steps Command Implementation
 *
 * Lists all steps in the current plan.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  _args: string,
  _context: ToolUseContext,
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

  if (!isActive) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Plan Steps
═══════════════════════════════════════

  Status: Not in plan mode

───────────────────────────────────────
  Use /plan to enter plan mode first.
  Use /add-step <description> to add steps.

`,
    }
  }

  // In plan mode - show status
  return {
    type: 'query',
    text: 'list_plan_steps',
  }
}

export const module: LocalCommandModule = { call }
