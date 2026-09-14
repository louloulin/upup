// @ts-nocheck
/**
 * Steps Command Implementation
 *
 * Lists all steps in the current plan.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

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
