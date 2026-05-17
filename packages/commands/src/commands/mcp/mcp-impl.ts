/**
 * MCP Command Implementation
 * 
 * Shows MCP server status and connected tools.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

export interface MCPContext extends ToolUseContext {
  mcpStatus?: {
    connected: number
    total: number
    servers?: Array<{
      name: string
      state: 'connected' | 'connecting' | 'error' | 'disconnected'
      toolCount: number
    }>
  }
}

export const call = async (
  _args: string,
  context: MCPContext,
): Promise<LocalCommandResult> => {
  const status = context.mcpStatus

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  MCP Server Status',
    '═══════════════════════════════════════',
    '',
  ]

  if (status) {
    lines.push(`Servers: ${status.connected}/${status.total} connected`)
    lines.push('')

    if (status.servers && status.servers.length > 0) {
      lines.push('───────────────────────────────────────')
      lines.push('  Connected Servers')
      lines.push('───────────────────────────────────────')
      
      for (const server of status.servers) {
        const icon = server.state === 'connected' ? '✓' : server.state === 'connecting' ? '⏳' : server.state === 'error' ? '✗' : '○'
        lines.push(`  ${icon} ${server.name}: ${server.state} (${server.toolCount} tools)`)
      }
    } else {
      lines.push('  ○ No MCP servers configured')
      lines.push('  Edit .upup/mcp-config.json to add servers')
    }
  } else {
    lines.push('  ○ MCP status not available')
  }

  lines.push('')
  return { type: 'text', value: lines.join('\n') }
}