// @ts-nocheck
/**
 * MCP Add Command Implementation
 *
 * Shows how to add an MCP server.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Add MCP Server',
    '═══════════════════════════════════════',
    '',
    'MCP (Model Context Protocol) servers extend UpUp',
    'with additional tools and capabilities.',
    '',
    'Usage: /mcp-add <server-name> <command>',
    '',
    'Example:',
    '  /mcp-add filesystem npx @anthropic/mcp-server-fs',
    '',
    '───────────────────────────────────────',
    '  Current MCP servers:',
  ]

  // Use the port registry — no fragile deep import needed
  const mcp = context.capabilities?.mcpRegistry
  if (mcp) {
    try {
      const status = mcp.getStatus()
      if (status.totalServers > 0) {
        lines.push(`    ${status.connectedServers}/${status.totalServers} connected`)
      } else {
        lines.push('    No MCP servers configured')
      }
    } catch {
      lines.push('    No MCP servers configured')
    }
  } else {
    lines.push('    No MCP servers configured')
  }

  lines.push('')
  lines.push('  Use /mcp to see all MCP servers')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }