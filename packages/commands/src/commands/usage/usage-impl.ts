/**
 * Usage Command Implementation
 *
 * Shows token usage statistics.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Token Usage',
    '═══════════════════════════════════════',
    '',
  ]

  try {
    const { getAppState, formatCost, formatTokens } = await import('../../../../../src/state/index.js')
    const appState = getAppState()
    const state = appState.getState()

    lines.push(`  Input:  ${formatTokens(state.totalInputTokens)} tokens`)
    lines.push(`  Output: ${formatTokens(state.totalOutputTokens)} tokens`)
    lines.push(`  Total:  ${formatTokens(state.totalTokens)} tokens`)
    lines.push('')
    lines.push(`  Session Cost: ${formatCost(state.totalCostUSD)}`)
    lines.push('')
    lines.push(`  Tool Calls: ${state.totalToolCalls}`)
    lines.push(`  Errors: ${state.totalToolErrors}`)
  } catch {
    lines.push('  Usage data not available.')
    lines.push('')
    lines.push('  Use /cost for detailed cost tracking.')
  }

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }