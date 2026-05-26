/**
 * Add-Step Command Implementation
 *
 * Adds a step to the current plan.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  // Check if in plan mode
  let isActive = false

  try {
    const { getPlanModeState } = await import('../../../../src/agent/plan-mode-state.js')
    const planMode = getPlanModeState()
    isActive = planMode.isActive()
  } catch {
    // Plan mode not available
  }

  if (!isActive) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Add Step
═══════════════════════════════════════

  Status: Not in plan mode

───────────────────────────────────────
  Use /plan to enter plan mode first.

`,
    }
  }

  if (!args || !args.trim()) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Add Step
═══════════════════════════════════════

  Usage: /add-step <step description>

───────────────────────────────────────
  Example:
    /add-step Research market trends
    /add-step Write unit tests for auth module

`,
    }
  }

  const stepText = args.trim()

  return {
    type: 'query',
    text: `add_plan_step ${stepText}`,
  }
}

export const module: LocalCommandModule = { call }
