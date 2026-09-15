// @ts-nocheck
/**
 * Remote Command Implementation
 *
 * Shows git remote configuration.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'
import { execSync } from 'child_process'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const action = args.trim().toLowerCase()

  try {
    if (!action || action === '-v') {
      const output = execSync('git remote -v', { cwd: context.cwd, encoding: 'utf-8' })
      const lines = [
        '',
        '═══════════════════════════════════════',
        '  Git Remotes',
        '═══════════════════════════════════════',
        '',
      ]
      if (output.trim()) {
        const remotes = output.split('\n').filter(r => r.trim())
        for (const remote of remotes) {
          lines.push(`  ${remote}`)
        }
      } else {
        lines.push('  No remotes configured.')
      }
      lines.push('')
      lines.push('  Use: /remote add <name> <url>')
      return { type: 'text', value: lines.join('\n') }
    }

    if (action === 'show') {
      const output = execSync('git remote show', { cwd: context.cwd, encoding: 'utf-8' })
      return { type: 'text', value: output || 'No remotes.' }
    }

    return {
      type: 'text',
      value: `Usage: /remote [-v] [show]

  /remote -v    - Show all remotes (verbose)`,
    }
  } catch (error) {
    return { type: 'text', value: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const module: LocalCommandModule = { call }