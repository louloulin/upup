// @ts-nocheck
/**
 * Reset-Permissions Command Implementation
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export const call = async (
  _args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  return {
    type: 'text',
    value: `
═══════════════════════════════════════
  Reset Permissions
═══════════════════════════════════════

  All session permissions will be reset.
  This means:
  - All approved tools will require re-approval
  - All denied tools will be unblocked

  To continue, confirm you want to reset.

───────────────────────────────────────
  Use: /permissions to view current rules
`,
  }
}