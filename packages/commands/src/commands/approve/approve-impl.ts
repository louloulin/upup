/**
 * Approve Command Implementation
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
  Approve Tool
═══════════════════════════════════════

  Usage: /approve <tool-name>

  Approves a tool for use in this session.
  Approved tools won't prompt for approval again.

───────────────────────────────────────
  Examples:
    /approve Bash
    /approve Read
    /approve Edit

`,
    }
  }

  const toolName = args.trim()
  return {
    type: 'text',
    value: `
═══════════════════════════════════════
  Approve Tool
═══════════════════════════════════════

  Tool: ${toolName}

  To approve this tool in the session:
  1. Use the tool when prompted
  2. Select "allow-session" or "always allow"

  Or add a permanent rule in .upup/permissions.json:
  {
    "tool": "${toolName}",
    "decision": "allow"
  }

───────────────────────────────────────
`,
  }
}