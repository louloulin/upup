/**
 * Sandbox Command Implementation
 * 
 * Shows or configures sandbox settings.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export interface SandboxContext extends ToolUseContext {
  sandboxMode?: 'strict' | 'relaxed' | 'disabled'
  sandboxEnabled?: boolean
  sandboxAdditionalDirs?: string[]
}

export const call = async (
  args: string,
  context: SandboxContext,
): Promise<LocalCommandResult> => {
  const mode = context.sandboxMode ?? 'relaxed'
  const enabled = context.sandboxEnabled ?? true

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Sandbox Configuration',
    '═══════════════════════════════════════',
    '',
  ]

  // Handle subcommands
  const subcommand = args?.trim().toLowerCase()

  if (!subcommand || subcommand === 'status') {
    // Show current status
    const modeDisplay = mode === 'strict' ? 'Strict (cwd only)' :
                        mode === 'disabled' ? 'Disabled (no restrictions)' :
                        'Relaxed (cwd + ~/.upup)'
    
    lines.push(`  Mode: ${modeDisplay}`)
    lines.push(`  Status: ${enabled ? '✓ Enabled' : '✗ Disabled'}`)
    lines.push('')
    lines.push('  Additional Directories:')
    if (context.sandboxAdditionalDirs && context.sandboxAdditionalDirs.length > 0) {
      for (const dir of context.sandboxAdditionalDirs) {
        lines.push(`    - ${dir}`)
      }
    } else {
      lines.push('    (none)')
    }
    lines.push('')
  } else if (subcommand === 'help') {
    lines.push('  Usage:')
    lines.push('  /sandbox            Show current status')
    lines.push('  /sandbox strict     Set strict mode (cwd only)')
    lines.push('  /sandbox relaxed   Set relaxed mode (cwd + ~/.upup)')
    lines.push('  /sandbox disable  Disable sandbox (dangerous!)')
    lines.push('')
  } else {
    lines.push(`  Unknown option: ${subcommand}`)
    lines.push('  Use /sandbox help for usage information')
    lines.push('')
  }

  return { type: 'text', value: lines.join('\n') }
}