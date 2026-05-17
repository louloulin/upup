/**
 * MCP Command
 * 
 * Shows MCP server status and connected tools.
 * 
 * Type: local (direct execution, no model involvement)
 */

import type { LocalCommand } from '../../types/command-types.js'

export const mcpCommand: LocalCommand = {
  type: 'local',
  name: 'mcp',
  description: 'Show MCP server status and tools',
  aliases: ['mcp-status'],
  supportsNonInteractive: true,
  load: () => import('./mcp-impl.js'),
}

export default mcpCommand