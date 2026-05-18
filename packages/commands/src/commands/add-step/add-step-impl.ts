/**
 * Add-Step Command Implementation
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  if (!args || !args.trim()) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Add Step
═══════════════════════════════════════

  Usage: /add-step <step description>

  Example:
    /add-step Research market trends

───────────────────────────────────────
`,
    }
  }

  return {
    type: 'text',
    value: `
═══════════════════════════════════════
  Add Step
═══════════════════════════════════════

  Step: ${args}

  Use the add_plan_step tool to add this step.
  Or use /steps to view all plan steps.

───────────────────────────────────────
`,
  }
}