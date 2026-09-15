// @ts-nocheck
/**
 * Exit-Plan Command Implementation
 *
 * Exits plan mode and starts execution.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export const call = async (
  _args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  // Use the port registry — no fragile deep import needed
  const planMode = context.capabilities?.planMode
  const isActive = planMode?.isActive() ?? false
  const planId = planMode?.getPlanId()

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

  // Use the port registry to exit
  if (planMode) {
    try {
      planMode.exit()
      return {
        type: 'query',
        text: 'exit_plan_mode',
      }
    } catch {
      // Fall through to fallback
    }
  }

  try {
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
  } catch {
    return {
      type: 'text',
      value: `Unable to exit plan mode${planId ? ` for plan ${planId}` : ''}.`,
    }
  }
}

export const module: LocalCommandModule = { call }
