/**
 * Rules Command Implementation
 *
 * Reads and displays research rules from RULES.md
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

export const call = async (
  _args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const rulesPath = resolve(context.cwd, '.upup', 'RULES.md')

  try {
    const content = await readFile(rulesPath, 'utf-8')
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Research Rules
═══════════════════════════════════════

${content}

───────────────────────────────────────
`,
    }
  } catch {
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Research Rules
═══════════════════════════════════════

  Status: ○ Not configured
  No .upup/RULES.md found.

───────────────────────────────────────
  To create rules:
    1. Create .upup/RULES.md
    2. Add your research guidelines
    3. Use /rules to view them

`,
    }
  }
}