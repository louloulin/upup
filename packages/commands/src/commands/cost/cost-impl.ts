// @ts-nocheck
/**
 * Cost Command Implementation
 * 
 * Displays token usage and cost tracking for the current session.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

// Extend context to include cost state
export interface CostContext extends ToolUseContext {
  state?: CostState
}

export interface CostState {
  totalInputTokens?: number
  totalOutputTokens?: number
  totalCostUSD?: number
  totalToolCalls?: number
  totalToolErrors?: number
  sessionDuration?: number // milliseconds
}

export const call = async (
  _args: string,
  context: CostContext,
): Promise<LocalCommandResult> => {
  const state = context.state ?? {}
  
  const totalTokens = (state.totalInputTokens ?? 0) + (state.totalOutputTokens ?? 0)
  const hours = (state.sessionDuration ?? 0) / (1000 * 60 * 60)
  const ratePerHour = hours > 0 ? (state.totalCostUSD ?? 0) / hours : 0

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Token Usage & Cost',
    '═══════════════════════════════════════',
    '',
    `Model: ${context.model ?? 'default'}`,
    '',
    '───────────────────────────────────────',
    '  Token Usage',
    '───────────────────────────────────────',
    `  Input:  ${formatTokens(state.totalInputTokens ?? 0)} tokens`,
    `  Output: ${formatTokens(state.totalOutputTokens ?? 0)} tokens`,
    `  Total:  ${formatTokens(totalTokens)} tokens`,
    '',
    '───────────────────────────────────────',
    '  Cost',
    '───────────────────────────────────────',
    `  Session cost: ${formatCost(state.totalCostUSD ?? 0)}`,
    hours > 0 ? `  Rate: ~${formatCost(ratePerHour)}/hour` : null,
    '',
    '───────────────────────────────────────',
    '  Tool Usage',
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

// Simple token formatter
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`
  }
  return tokens.toLocaleString()
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