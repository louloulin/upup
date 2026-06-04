/**
 * Resume Command Implementation
 *
 * Shows how to resume a previous conversation.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getStatePortLocal } from '../../agent-port.js'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Resume Session',
    '═══════════════════════════════════════',
    '',
    'Use the session selector to resume a previous conversation.',
    '',
    'Available sessions are shown in the session list.',
    'Navigate with ↑/↓ and press Enter to select.',
    '',
    '───────────────────────────────────────',
    '  Recent sessions are marked with timestamps.',
    '  Tagged sessions show their tags.',
  ]

  // Use the port registry — no fragile deep import needed
  const state = getStatePortLocal()
  if (state) {
    try {
      const sessionManager = state.getSessionManager()
      const sessions = await sessionManager.listSessions(10)
      if (sessions.length > 0) {
        lines.push('')
        lines.push('  Recent Sessions:')
        for (const session of sessions.slice(0, 5)) {
          const title = session.customTitle || session.firstPrompt?.slice(0, 40) || 'Untitled'
          lines.push(`    - ${title}`)
        }
      }
    } catch {
      // Session manager not available
    }
  }

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }