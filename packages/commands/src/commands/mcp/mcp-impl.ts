// @ts-nocheck
/**
 * MCP Command Implementation
 *
 * Shows MCP server status and connected tools.
 * Attempts to get real MCP status from the MCP client.
 */

import type { LocalCommandResult, ToolUseContext } from '../../types/command-types.js'

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
  // Allow MCP client to be passed directly
  getMCPStatus?: () => Promise<{
    connectedServers: number
    totalServers: number
    servers: Array<{
      name: string
      state: 'connected' | 'connecting' | 'error' | 'disconnected'
      toolCount: number
    }>
  }>
}

interface MCPStatusResult {
  connectedServers: number
  totalServers: number
  servers: Array<{
    name: string
    state: 'connected' | 'connecting' | 'error' | 'disconnected'
    toolCount: number
  }>
}

async function fetchMCPStatus(cwd: string): Promise<MCPStatusResult | null> {
  try {
    // Try to get MCP client and status
    const { getDefaultMCPClient } = await import('@upup/mcp')
    const { getMCPStatus } = await import('../../../mcp/registry.js')

    const client = getDefaultMCPClient()
    const status = getMCPStatus(client)

    return status
  } catch {
    return null
  }
}

export const call = async (
  _args: string,
  context: MCPContext,
): Promise<LocalCommandResult> => {
  // Try to get status from context first
  const contextStatus = context.mcpStatus

  // Try to get status from MCP client if available
  let clientStatus: MCPStatusResult | null = null
  if (context.getMCPStatus) {
    try {
      clientStatus = await context.getMCPStatus()
    } catch {
      // Ignore
    }
  } else {
    // Try to fetch from default MCP client
    clientStatus = await fetchMCPStatus(context.cwd)
  }

  const status = clientStatus ?? contextStatus

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  MCP Server Status',
    '═══════════════════════════════════════',
    '',
  ]

  if (status && status.totalServers > 0) {
    lines.push(`Servers: ${status.connectedServers}/${status.totalServers} connected`)
    lines.push('')

    if (status.servers && status.servers.length > 0) {
      lines.push('───────────────────────────────────────')
      lines.push('  Connected Servers')
      lines.push('───────────────────────────────────────')

      for (const server of status.servers) {
        const icon = server.state === 'connected' ? '✓' : server.state === 'connecting' ? '⏳' : server.state === 'error' ? '✗' : '○'
        lines.push(`  ${icon} ${server.name}: ${server.state} (${server.toolCount} tools)`)
      }

      lines.push('')
      lines.push('───────────────────────────────────────')
      lines.push('  Commands')
      lines.push('───────────────────────────────────────')
      lines.push('  /mcp              Show MCP status')
      lines.push('  /mcp-add          Add MCP server')
      lines.push('  Edit .upup/mcp-config.json to configure servers')
    }
  } else {
    lines.push('  ○ No MCP servers configured')
    lines.push('')
    lines.push('  Edit .upup/mcp-config.json to add servers')
    lines.push('')
    lines.push('───────────────────────────────────────')
    lines.push('  Commands')
    lines.push('───────────────────────────────────────')
    lines.push('  /mcp              Show MCP status')
    lines.push('  /mcp-add          Add MCP server')
  }

  lines.push('')
  return { type: 'text', value: lines.join('\n') }
}