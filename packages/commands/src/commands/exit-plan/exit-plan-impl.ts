// @ts-nocheck - temporary fix for type narrowing
/**
 * Exit-Plan Command Implementation
 *
 * Exits plan mode and starts execution.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getPlanModePortLocal } from '../../agent-port.js'

export const call = async (
  _args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  // Use the port registry — no fragile deep import needed
  const planMode = getPlanModePortLocal()
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
        type: 'text',
        value: 'exit_plan_mode',
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
    // Fallback failed
  }
}

export const module: LocalCommandModule = { call }
