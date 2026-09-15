// @ts-nocheck
/**
 * Effort Command Implementation
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
  Effort Estimation
═══════════════════════════════════════

  Current task effort estimation:

  Estimated: --
  Complexity: --
  Time: --

───────────────────────────────────────
  Effort Levels:
    minimal  - Few minutes
    short    - 15-30 minutes
    medium   - 1-2 hours
    long     - Half day
    extended - Full day or more

───────────────────────────────────────
  Use /effort <description> for specific
  task estimation.
`,
  }
}