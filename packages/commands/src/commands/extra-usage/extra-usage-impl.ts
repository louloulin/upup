/**
 * Extra-Usage Command Implementation
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
  Detailed Usage Statistics
═══════════════════════════════════════

  Session Duration: --:--
  Model: --

───────────────────────────────────────
  Token Usage
───────────────────────────────────────
  Input tokens:    --
  Output tokens:   --
  Total tokens:    --

───────────────────────────────────────
  Cost Breakdown
───────────────────────────────────────
  Input cost:      --
  Output cost:      --
  Total cost:       --

───────────────────────────────────────
  Tool Usage
───────────────────────────────────────
  Total calls:      --
  Success rate:     --
  Most used:        --

───────────────────────────────────────
  Commands:
    /usage     - Quick usage summary
    /cost      - Session cost
    /extra-usage - This detailed view
`,
  }
}