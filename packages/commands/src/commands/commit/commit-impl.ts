/**
 * Commit Command Implementation
 *
 * Stages all changes and commits.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { execSync } from 'child_process'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const message = args.trim()

  if (!message) {
    return {
      type: 'text',
      value: `Usage: /commit <message>

Examples:
  /commit initial commit
  /commit "fix: resolve bug"
`,
    }
  }

  try {
    // Check git status first
    const status = execSync('git status --short', {
      cwd: context.cwd,
      encoding: 'utf-8',
    })

    if (!status.trim()) {
      return { type: 'text', value: 'Nothing to commit - working tree clean.' }
    }

    // Stage all changes
    execSync('git add -A', { cwd: context.cwd, encoding: 'utf-8' })

    // Commit
    const output = execSync(`git commit -m "${message}"`, {
      cwd: context.cwd,
      encoding: 'utf-8',
    })

    return { type: 'text', value: output || `Committed: ${message}` }
  } catch (error) {
    return { type: 'text', value: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const module: LocalCommandModule = { call }