// @ts-nocheck
/**
 * Agents Command Implementation
 *
 * Lists active agents.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Active Agents',
    '═══════════════════════════════════════',
    '',
    '  1. Main Agent (current session)',
    '',
  ]

  // Use the port registry — no fragile deep import needed
  const subagent = context.capabilities?.subagent
  if (subagent) {
    try {
      const tasks = subagent.getAllTasks()
      if (tasks.length > 0) {
        lines.push('  Background Agents:')
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i]
          lines.push(`    ${i + 2}. ${task.status}: ${task.prompt.substring(0, 40)}...`)
        }
      }
    } catch {
      // Subagent port not available
    }
  }

  lines.push('')
  lines.push('  Use /fork to spawn a new agent.')
  lines.push('  Use /tasks to manage background tasks.')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }