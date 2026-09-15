// @ts-nocheck
/**
 * Agent Command Implementation
 *
 * Spawn subagents for parallel or background tasks.
 *
 * Usage: /agent <description> [--background]
 *   /agent research task --background
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/)
  const description = parts[0] || ''
  const isBackground = args.includes('--background') || args.includes('-b')

  if (!description) {
    return {
      type: 'text',
      value: `
🤖 Agent Command Help

Usage: /agent <description> [--background]

Spawns a subagent to work on a task in parallel.

Options:
  --background, -b    Run agent in background

Examples:
  /agent research latest AI developments
  /agent debug memory issue --background

Note: Tasks are executed by the Pi background-session service.
`,
    }
  }

  // Use the port registry — no fragile deep import needed
  const subagent = context.capabilities?.subagent
  if (subagent) {
    try {
      const task = await subagent.createTask({
        description,
        prompt: `You are a subagent tasked with: ${description}`,
        runInBackground: isBackground,
      })
      return {
        type: 'text',
        value: isBackground
          ? `✅ Agent spawned in background (ID: ${task.id})\n   Task: ${description}`
          : `🤖 Agent started (ID: ${task.id})\n   Task: ${description}\n\nUse /tasks to check status.`,
      }
    } catch (error) {
      return {
        type: 'error',
        message: `Pi background-session service failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return {
    type: 'error',
    message: 'Pi background-session service is not initialized; no alternate Agent runtime is available.',
  }
}
