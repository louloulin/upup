/**
 * Steps Command Implementation
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  _args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  return {
    type: 'text',
    value: `
═══════════════════════════════════════
  Plan Steps
═══════════════════════════════════════

  No active plan.

  Use /plan to start planning.
  Use /add-step <description> to add steps.

───────────────────────────────────────
  Commands:
    /plan        - Open plan mode
    /add-step    - Add a step
    /exit-plan   - Exit and execute

`,
  }
}