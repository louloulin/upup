/**
 * Exit-Plan Command Implementation
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
  Exit Plan Mode
═══════════════════════════════════════

  To exit plan mode:
    Use the exit_plan_mode tool with action="save"
    to save the plan and start execution.

  Commands:
    /exit-plan  - Exit and save plan
    /steps      - View current plan steps

`,
  }
}