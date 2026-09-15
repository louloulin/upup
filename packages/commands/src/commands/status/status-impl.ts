// @ts-nocheck
/**
 * Status Command Implementation
 *
 * Displays comprehensive system status with state integration.
 * Shows session info, model, tokens, MCP status, and more.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export interface StatusContext extends ToolUseContext {
  state?: {
    totalInputTokens?: number
    totalOutputTokens?: number
    totalTokens?: number
    totalCostUSD?: number
    totalToolCalls?: number
    totalToolErrors?: number
    messageCount?: number
    compactionCount?: number
    proactiveEventsCount?: number
    provider?: string
    sessionId?: string
  }
}

export const call = async (
  _args: string,
  context: StatusContext,
): Promise<LocalCommandResult> => {
  const state = context.state ?? {}
  const sessionDuration = context.sessionDuration ?? 0

  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  System Status',
    '═══════════════════════════════════════',
    '',
    `Session ID: ${state.sessionId?.substring(0, 12) ?? 'N/A'}...`,
    `Model: ${context.model ?? 'default'} (${state.provider ?? 'unknown'})`,
    `Duration: ${formatDuration(sessionDuration)}`,
    '',
    '───────────────────────────────────────',
    '  Agent',
    '───────────────────────────────────────',
    `  Messages: ${state.messageCount ?? 0}`,
    `  Compactions: ${state.compactionCount ?? 0}`,
    '',
    '───────────────────────────────────────',
    '  Tokens',
    '───────────────────────────────────────',
    `  Input:  ${formatTokens(state.totalInputTokens ?? 0)}`,
    `  Output: ${formatTokens(state.totalOutputTokens ?? 0)}`,
    `  Cost: ${formatCost(state.totalCostUSD ?? 0)}`,
    '',
    '───────────────────────────────────────',
    '  Tools',
    '───────────────────────────────────────',
    `  Total calls: ${state.totalToolCalls ?? 0}`,
    `  Errors: ${state.totalToolErrors ?? 0}`,
    state.totalToolCalls && state.totalToolCalls > 0
      ? `  Success rate: ${((1 - (state.totalToolErrors ?? 0) / state.totalToolCalls) * 100).toFixed(1)}%`
      : null,
    '',
  ].filter((line): line is string => line !== null)

  return { type: 'text', value: lines.join('\n') }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toLocaleString()
}

function formatCost(costUSD: number): string {
  if (costUSD >= 1) {
    return `$${costUSD.toFixed(2)}`
  }
  if (costUSD >= 0.01) {
    return `$${costUSD.toFixed(4)}`
  }
  return `$${costUSD.toFixed(6)}`
}