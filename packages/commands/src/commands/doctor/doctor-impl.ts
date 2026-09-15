// @ts-nocheck
/**
 * Doctor Command Implementation
 * 
 * Runs system health checks for API keys, memory, MCP, and permissions.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

// Extend context to include health check state
export interface DoctorContext extends ToolUseContext {
  apiKeys?: Record<string, boolean>
  memoryAvailable?: boolean
  mcpStatus?: { connected: number; total: number }
  permissionCount?: number
}

export const call = async (
  _args: string,
  context: DoctorContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  UpUp Health Check',
    '═══════════════════════════════════════',
    '',
  ]

  // API Key check
  const providers = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY']
  const hasAnyKey = providers.some(key => context.env?.[key])
  
  lines.push('───────────────────────────────────────')
  lines.push('  API Keys')
  lines.push('───────────────────────────────────────')
  
  for (const key of providers) {
    const provider = key.replace('_API_KEY', '').toLowerCase()
    const hasKey = Boolean(context.env?.[key])
    lines.push(`  ${provider}: ${hasKey ? '✓ configured' : '○ not configured'}`)
  }
  
  lines.push('')

  // Model check
  lines.push('───────────────────────────────────────')
  lines.push('  Model')
  lines.push('───────────────────────────────────────')
  lines.push(`  ${context.model ?? 'default'}`)
  lines.push('')

  // Memory check
  lines.push('───────────────────────────────────────')
  lines.push('  Memory')
  lines.push('───────────────────────────────────────')
  lines.push(`  ${context.memoryAvailable !== false ? '✓ available' : '○ unavailable'}`)
  lines.push('')

  // MCP check
  lines.push('───────────────────────────────────────')
  lines.push('  MCP')
  lines.push('───────────────────────────────────────')
  if (context.mcpStatus) {
    lines.push(`  ${context.mcpStatus.connected}/${context.mcpStatus.total} servers connected`)
  } else {
    lines.push('  ○ no status available')
  }
  lines.push('')

  // Permissions check
  lines.push('───────────────────────────────────────')
  lines.push('  Permissions')
  lines.push('───────────────────────────────────────')
  if (context.permissionCount !== undefined) {
    lines.push(`  ${context.permissionCount} rules active`)
  } else {
    lines.push('  ○ no permissions configured')
  }
  lines.push('')

  return { type: 'text', value: lines.join('\n') }
}