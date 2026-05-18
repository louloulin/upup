/**
 * Heartbeat Command Implementation
 *
 * Reads and displays heartbeat checklist from HEARTBEAT.md
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { readFile } from 'fs/promises'
import { resolve } from 'path'

export const call = async (
  _args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const heartbeatPath = resolve(context.cwd, '.upup', 'HEARTBEAT.md')

  try {
    const content = await readFile(heartbeatPath, 'utf-8')
    return {
      type: 'text',
      value: `
═══════════════════════════════════════
  Heartbeat Checklist
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
  Heartbeat Checklist
═══════════════════════════════════════

  Status: ○ Not configured
  No .upup/HEARTBEAT.md found.

───────────────────────────────────────
  To create heartbeat:
    1. Create .upup/HEARTBEAT.md
    2. Add your periodic checklist
    3. Use /heartbeat to view it

`,
    }
  }
}