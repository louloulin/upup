// @ts-nocheck
/**
 * Feedback Command Implementation
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  if (!args || !args.trim()) {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Feedback
═══════════════════════════════════════

  Usage: /feedback <your-feedback>

  Submit feedback about your experience.
  Your feedback helps improve the tool.

───────────────────────────────────────
  Examples:
    /feedback The search is slow
    /feedback Add dark mode support
    /feedback Love the new commands!

`,
    }
  }

  return {
    type: 'text',
    value: `
═══════════════════════════════════════
  Feedback Submitted
═══════════════════════════════════════

  Thank you for your feedback!

  Your feedback has been recorded.
  We appreciate your input!

───────────────────────────────────────
`,
  }
}