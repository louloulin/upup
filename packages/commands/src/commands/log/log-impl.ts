// @ts-nocheck
/**
 * Log Command Implementation
 *
 * Shows git commit history.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'
import { execSync } from 'child_process'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const count = args.match(/^-(\d+)/)?.[1] || '10'

  try {
    const output = execSync(`git log --oneline -n ${count}`, {
      cwd: context.cwd,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    })

    const lines = [
      '',
      '═══════════════════════════════════════',
      `  Git Log (last ${count} commits)`,
      '═══════════════════════════════════════',
      '',
      ...output.split('\n').map(line => `  ${line}`),
      '',
    ]

    return { type: 'text', value: lines.join('\n') }
  } catch (error) {
    return { type: 'text', value: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const module: LocalCommandModule = { call }