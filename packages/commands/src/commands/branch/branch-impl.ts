// @ts-nocheck
/**
 * Branch Command Implementation
 *
 * Lists and manages git branches.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'
import { execSync } from 'child_process'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  try {
    // Get current branch
    const currentBranch = execSync('git branch --show-current 2>/dev/null || echo ""', {
      cwd: context.cwd,
      encoding: 'utf-8',
    }).trim()

    // Get all branches
    const output = execSync('git branch -a 2>/dev/null || echo "No git repository"', {
      cwd: context.cwd,
      encoding: 'utf-8',
    })

    const lines = [
      '',
      '═══════════════════════════════════════',
      '  Git Branches',
      '═══════════════════════════════════════',
      '',
    ]

    const branches = output.split('\n').filter(b => b.trim())
    for (const branch of branches) {
      const isCurrent = branch.includes('*')
      const name = branch.replace(/^\*?\s*/, '').trim()
      if (isCurrent) {
        lines.push(`  * ${name}  ${currentBranch === name ? '(current)' : ''}`)
      } else {
        lines.push(`    ${name}`)
      }
    }

    lines.push('')
    lines.push('───────────────────────────────────────')
    lines.push('  Usage: /branch [name] to create new branch')

    return { type: 'text', value: lines.join('\n') }
  } catch (error) {
    return { type: 'text', value: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const module: LocalCommandModule = { call }