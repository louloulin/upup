// @ts-nocheck
/**
 * MCP Add Command
 *
 * Add an MCP server configuration.
 *
 * Type: local
 * Category: mcp
 */

import type { LocalCommand } from '../../types/command-types'

export const mcpAddCommand: LocalCommand = {
  type: 'local',
  name: 'mcp-add',
  description: 'Add an MCP server configuration',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./mcp-add-impl'),
}

export default mcpAddCommand