/**
 * Add-Step Command Implementation
 *
 * Adds a step to the current plan.
 *
 * Module boundary: this file lives in packages/commands/ and must NOT
 * import from src/agent/ directly. It consumes the PlanMode port via the
 * globalThis registry populated by src/agent/plan-mode-state.ts at startup.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getPlanModePortLocal } from '../../agent-port.js'

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  // Read plan-mode state via the public port (no cross-package import).
  const port = getPlanModePortLocal()
  const isActive = port?.isActive() ?? false

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
    type: 'text',
    value: `add_plan_step ${stepText}`,
  }
}

export const module: LocalCommandModule = { call }
