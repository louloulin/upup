/**
 * Agent Command Implementation
 *
 * Spawn subagents for parallel or background tasks.
 *
 * Usage: /agent <description> [--background]
 *   /agent research task --background
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getSubagentPortLocal } from '../../agent-port.js'

export const call = async (
  args: string,
  _context: ToolUseContext,
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

Note: The actual agent spawning requires integration with the
agent runner system in src/agent/subagent-runner.js
`,
    }
  }

  // Use the port registry — no fragile deep import needed
  const subagent = getSubagentPortLocal()
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
    } catch {
      // Fall through to fallback
    }
  }

  try {
    // Fallback: describe what would happen
    return {
      type: 'text',
      value: `🤖 Would spawn agent for: ${description}\n\n   Mode: ${isBackground ? 'background' : 'foreground'}\n\n   Note: Agent system not fully initialized.\n   Check /status for agent availability.`,
    }
  } catch {
    return { type: 'text', value: '❌ Agent command failed' }
  }
}