/**
 * Exit-Plan Command Implementation
 *
 * Exits plan mode and starts execution.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  _args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  // Dynamic import to avoid circular dependency
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
  Exit Plan Mode
═══════════════════════════════════════

  Status: Not in plan mode

───────────────────────────────────────
  Use /plan to enter plan mode first.

`,
    }
  }

  // Try to exit plan mode
  try {
    const { getPlanModeState } = await import('../../../../src/agent/plan-mode-state.js')
    const planMode = getPlanModeState()
    planMode.exit()

    return {
      type: 'query',
      text: 'exit_plan_mode',
    }
  } catch {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Exit Plan Mode
═══════════════════════════════════════

  ✓ Exited plan mode
  Plan ID: ${planId?.substring(0, 12) ?? 'N/A'}...

───────────────────────────────────────
  Ready for execution.

`,
    }
  }
}

export const module: LocalCommandModule = { call }
