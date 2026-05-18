/**
 * Export Command Implementation
 *
 * Exports conversation to file.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Export Conversation',
    '═══════════════════════════════════════',
    '',
    'Export the current conversation to a file.',
    '',
    'Usage: /export [format] [filename]',
    '',
    'Formats:',
    '  md     - Markdown (default)',
    '  txt    - Plain text',
    '  json   - JSON format',
    '',
    'Example:',
    '  /export md my-conversation',
    '  /export json session-2024-05-17',
    '',
  ]

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }