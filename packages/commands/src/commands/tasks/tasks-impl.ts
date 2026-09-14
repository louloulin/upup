// @ts-nocheck
/**
 * Tasks Command Implementation
 *
 * Shows background task status.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getSubagentPortLocal } from '../../agent-port.js'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Background Tasks',
    '═══════════════════════════════════════',
    '',
  ]

  // Use the port registry — no fragile deep import needed
  const subagent = getSubagentPortLocal()
  if (subagent) {
    try {
      const tasks = subagent.getAllTasks()
      if (tasks.length === 0) {
        lines.push('  No active background tasks.')
      } else {
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i]
          lines.push(`  ${i + 1}. ${task.status}: ${task.prompt.substring(0, 50)}...`)
        }
      }
    } catch {
      lines.push('  No active background tasks.')
      lines.push('')
      lines.push('  Use /fork to start a background task.')
    }
  } else {
    lines.push('  No active background tasks.')
    lines.push('')
    lines.push('  Use /fork to start a background task.')
  }

  lines.push('')
  lines.push('───────────────────────────────────────')
  lines.push('  Usage: /tasks stop <id> to stop a task')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }