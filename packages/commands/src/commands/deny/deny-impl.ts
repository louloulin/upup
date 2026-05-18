/**
 * Deny Command Implementation
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
  Deny Tool
═══════════════════════════════════════

  Usage: /deny <tool-name>

  Denies a tool for use in this session.
  Denied tools will be blocked until session ends.

───────────────────────────────────────
  Examples:
    /deny Bash
    /deny Write
    /deny Edit

`,
    }
  }

  const toolName = args.trim()
  return {
    type: 'text',
    value: `
═══════════════════════════════════════
  Deny Tool
═══════════════════════════════════════

  Tool: ${toolName}

  To deny this tool in the session:
  1. When prompted for approval, select "deny"
  2. Or add a rule in .upup/permissions.json:
  {
    "tool": "${toolName}",
    "decision": "deny"
  }

  Denied tools cannot be used for the rest
  of this session.

───────────────────────────────────────
`,
  }
}