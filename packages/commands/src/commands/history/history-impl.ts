// @ts-nocheck
/**
 * History Command Implementation
 * 
 * Shows recent conversation history summaries.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export interface HistoryContext extends ToolUseContext {
  messages?: Array<{
    id: number
    query: string
    summary?: string
    timestamp?: number
  }>
}

export const call = async (
  _args: string,
  context: HistoryContext,
): Promise<LocalCommandResult> => {
  const messages = context.messages ?? []

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Conversation History',
    '═══════════════════════════════════════',
    '',
  ]

  if (messages.length === 0) {
    lines.push('  No conversation history yet.')
  } else {
    lines.push(`  ${messages.length} message(s)`)
    lines.push('')
    
    lines.push('───────────────────────────────────────')
    lines.push('  Recent Conversations')
    lines.push('───────────────────────────────────────')
    
    // Show last 10 messages
    const recentMessages = messages.slice(-10)
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i]!
      const num = messages.length - recentMessages.length + i + 1
      const summary = msg.summary ?? '(no summary)'
      const queryPreview = msg.query.length > 50 ? msg.query.substring(0, 50) + '...' : msg.query
      
      lines.push(`  ${num}. ${queryPreview}`)
      lines.push(`     ${summary}`)
      
      if (msg.timestamp) {
        const date = new Date(msg.timestamp)
        lines.push(`     ${date.toLocaleString()}`)
      }
      lines.push('')
    }
  }

  lines.push('───────────────────────────────────────')
  lines.push('  Commands')
  lines.push('───────────────────────────────────────')
  lines.push('  /history          Show recent history')
  lines.push('  /compact          Reduce context size')
  lines.push('  /clear            Clear all history')
  lines.push('')

  return { type: 'text', value: lines.join('\n') }
}