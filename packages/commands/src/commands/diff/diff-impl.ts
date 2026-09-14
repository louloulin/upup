// @ts-nocheck
/**
 * Diff Command Implementation
 *
 * Shows git diff output.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { execSync } from 'child_process'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  try {
    // Determine what to diff
    let diffArgs = 'HEAD'
    if (args.includes('--staged') || args.includes('--cached')) {
      diffArgs = '--cached'
    } else if (args.trim()) {
      diffArgs = args.trim()
    }

    const output = execSync(`git diff ${diffArgs}`, {
      cwd: context.cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })

    if (!output.trim()) {
      return { type: 'text', value: 'No changes to show.' }
    }

    return { type: 'text', value: output }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('fatal: ambiguous argument') || msg.includes('no changes')) {
      return { type: 'text', value: 'No changes to show.' }
    }
    return { type: 'text', value: `Error: ${msg}` }
  }
}

export const module: LocalCommandModule = { call }