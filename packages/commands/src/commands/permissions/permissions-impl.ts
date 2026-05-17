/**
 * Permissions Command Implementation
 * 
 * Shows current permission settings and approved tools.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export interface PermissionsContext extends ToolUseContext {
  permissionCount?: number
  approvedTools?: string[]
  deniedTools?: string[]
}

export const call = async (
  _args: string,
  context: PermissionsContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Permission Settings',
    '═══════════════════════════════════════',
    '',
    `Active rules: ${context.permissionCount ?? 0}`,
    '',
  ]

  // Approved tools
  if (context.approvedTools && context.approvedTools.length > 0) {
    lines.push('───────────────────────────────────────')
    lines.push('  Approved Tools')
    lines.push('───────────────────────────────────────')
    for (const tool of context.approvedTools) {
      lines.push(`  ✓ ${tool}`)
    }
    lines.push('')
  }

  // Denied tools
  if (context.deniedTools && context.deniedTools.length > 0) {
    lines.push('───────────────────────────────────────')
    lines.push('  Denied Tools')
    lines.push('───────────────────────────────────────')
    for (const tool of context.deniedTools) {
      lines.push(`  ✗ ${tool}`)
    }
    lines.push('')
  }

  lines.push('───────────────────────────────────────')
  lines.push('  Usage')
  lines.push('───────────────────────────────────────')
  lines.push('  /approve <tool>    Approve a tool')
  lines.push('  /deny <tool>      Deny a tool')
  lines.push('  /reset-permissions  Reset all permissions')
  lines.push('')

  return { type: 'text', value: lines.join('\n') }
}