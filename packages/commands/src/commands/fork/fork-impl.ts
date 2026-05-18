/**
 * Fork Command Implementation
 *
 * Creates a parallel fork for independent work.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Fork - Parallel Task Execution',
    '═══════════════════════════════════════',
    '',
    'A fork creates a parallel agent to work on a task',
    'independently while you continue with the main conversation.',
    '',
    'Usage: /fork <description of task>',
    '',
    'Example:',
    '  /fork Research competitor pricing',
    '',
    'The forked agent will work in the background and report back',
    'when complete.',
    '',
  ]

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }