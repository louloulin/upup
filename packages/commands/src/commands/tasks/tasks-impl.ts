/**
 * Tasks Command Implementation
 *
 * Shows background task status.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

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

  // Check if there's a task system
  try {
    // Import task system if available
    const { getDefaultSubagentRunner } = await import('../../../../../src/agent/subagent-runner.js')
    const runner = getDefaultSubagentRunner()
    const tasks = runner.getAllTasks()

    if (tasks.length === 0) {
      lines.push('  No active background tasks.')
    } else {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        lines.push(`  ${i + 1}. ${task.status}: ${task.prompt.substring(0, 50)}...`)
        if (task.result) {
          lines.push(`     Status: ${task.status}`)
        }
      }
    }
  } catch {
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