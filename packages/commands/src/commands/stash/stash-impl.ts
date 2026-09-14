// @ts-nocheck
/**
 * Stash Command Implementation
 *
 * Stashes or pops git changes.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { execSync } from 'child_process'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const action = args.trim().toLowerCase()

  try {
    let output = ''

    if (!action || action === 'list') {
      output = execSync('git stash list', { cwd: context.cwd, encoding: 'utf-8' })
      return { type: 'text', value: output || 'No stashes.' }
    }

    if (action === 'save' || action === 'push') {
      const message = args.replace(/^save\s*/, '').replace(/^push\s*/, '').trim()
      if (message) {
        output = execSync(`git stash push -m "${message}"`, { cwd: context.cwd, encoding: 'utf-8' })
      } else {
        output = execSync('git stash', { cwd: context.cwd, encoding: 'utf-8' })
      }
      return { type: 'text', value: output || 'Stashed changes.' }
    }

    if (action === 'pop' || action === 'apply') {
      const stashIndex = args.replace(/^(pop|apply)\s*/, '').trim() || '@{0}'
      const cmd = action === 'pop' ? 'pop' : 'apply'
      output = execSync(`git stash ${cmd} ${stashIndex}`, { cwd: context.cwd, encoding: 'utf-8' })
      return { type: 'text', value: output || `${cmd === 'pop' ? 'Popped' : 'Applied'} stash.` }
    }

    if (action === 'drop') {
      const stashIndex = args.replace(/^drop\s*/, '').trim() || '@{0}'
      output = execSync(`git stash drop ${stashIndex}`, { cwd: context.cwd, encoding: 'utf-8' })
      return { type: 'text', value: output || 'Dropped stash.' }
    }

    return {
      type: 'text',
      value: `Usage: /stash [list|save <msg>|pop|apply|drop]

  /stash list    - List all stashes
  /stash save    - Stash current changes
  /stash pop     - Apply and remove latest stash
  /stash apply   - Apply latest stash (keep it)
  /stash drop    - Remove latest stash`,
    }
  } catch (error) {
    return { type: 'text', value: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const module: LocalCommandModule = { call }