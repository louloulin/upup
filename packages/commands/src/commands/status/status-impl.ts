/**
 * Status Command Implementation
 * 
 * This is the implementation file that gets lazy-loaded.
 * Implements LocalCommandModule interface.
 */

import type { 
  LocalCommandModule,
  LocalCommandResult,
  ToolUseContext
} from '../../types/command-types.js'

// Extend context to include status state
export interface StatusContext extends ToolUseContext {
  state?: StatusState
}

export interface StatusState {
  totalInputTokens?: number
  totalOutputTokens?: number
  totalCostUSD?: number
  totalToolCalls?: number
  messageCount?: number
}

const generateStatusText = (context: StatusContext): string => {
  const state = context.state ?? {}
  
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  UpUp System Status',
    '═══════════════════════════════════════',
    '',
    `Session ID: ${context.sessionId?.substring(0, 20) ?? 'N/A'}...`,
    `Model: ${context.model ?? 'default'}`,
    '',
    '───────────────────────────────────────',
    '  Token Usage',
    '───────────────────────────────────────',
    `  Input:  ${formatTokens(state.totalInputTokens ?? 0)}`,
    `  Output: ${formatTokens(state.totalOutputTokens ?? 0)}`,
    `  Total:  ${formatTokens((state.totalInputTokens ?? 0) + (state.totalOutputTokens ?? 0))}`,
    '',
    '───────────────────────────────────────',
    '  Session Cost',
    '───────────────────────────────────────',
    `  ${formatCost(state.totalCostUSD ?? 0)}`,
    '',
    '───────────────────────────────────────',
    '  Statistics',
    '───────────────────────────────────────',
    `  Messages: ${state.messageCount ?? 0}`,
    `  Tool Calls: ${state.totalToolCalls ?? 0}`,
    '',
  ]

  return lines.join('\n')
}

// Simple token formatter (compatible with state/index.ts)
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toString()
}

// Simple cost formatter
function formatCost(costUSD: number): string {
  if (costUSD >= 1) {
    return `$${costUSD.toFixed(2)}`
  }
  if (costUSD >= 0.01) {
    return `$${costUSD.toFixed(4)}`
  }
  return `$${costUSD.toFixed(6)}`
}

// LocalCommandModule - call function that matches the interface
export const call = async (
  args: string,
  context: StatusContext,
): Promise<LocalCommandResult> => {
  const text = generateStatusText(context)
  return { type: 'text', value: text }
}