// @ts-nocheck
/**
 * Usage Command Implementation
 *
 * Shows token usage statistics.
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
    '  Token Usage',
    '═══════════════════════════════════════',
    '',
  ]

  // Use the port registry — no fragile deep import needed
  const statePort = getStatePortLocal()
  if (statePort) {
    try {
      const appState = statePort.getAppState()
      const state = appState.getState() as {
        totalInputTokens: number;
        totalOutputTokens: number;
        totalTokens: number;
        totalCostUSD: number;
        totalToolCalls: number;
        totalToolErrors: number;
      }

      lines.push(`  Input:  ${statePort.formatTokens(state.totalInputTokens)} tokens`)
      lines.push(`  Output: ${statePort.formatTokens(state.totalOutputTokens)} tokens`)
      lines.push(`  Total:  ${statePort.formatTokens(state.totalTokens)} tokens`)
      lines.push('')
      lines.push(`  Session Cost: ${statePort.formatCost(state.totalCostUSD)}`)
      lines.push('')
      lines.push(`  Tool Calls: ${state.totalToolCalls}`)
      lines.push(`  Errors: ${state.totalToolErrors}`)
    } catch {
      lines.push('  Usage data not available.')
      lines.push('')
      lines.push('  Use /cost for detailed cost tracking.')
    }
  } else {
    lines.push('  Usage data not available.')
    lines.push('')
    lines.push('  Use /cost for detailed cost tracking.')
  }

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }