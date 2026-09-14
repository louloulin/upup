// @ts-nocheck
/**
 * MCP Command
 *
 * Shows MCP server status and connected tools.
 * Renders interactive MCP status component.
 *
 * Type: local-jsx (renders TUI component)
 */

import type { LocalJSXCommand } from '../../types/command-types.js'

export const mcpCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'mcp',
  description: 'Show MCP server status and tools',
  aliases: ['mcp-status'],
  supportsNonInteractive: true,
  load: () => import('./mcp.tsx'),
}

export default mcpCommand