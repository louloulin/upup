/**
 * MCP Tool Registry Integration
 *
 * Converts MCP tools to UpUp's RegisteredTool format for integration
 * with the tool registry.
 */

import type { PiMcpTool } from '@upup/mcp';
import type { MCPClientManager, MCPServerConnection } from './client.js';

/**
 * MCP Registered Tool format
 */
export interface MCPRegisteredTool {
  name: string;
  tool: PiMcpTool;
  description: string;
  compactDescription: string;
  serverName: string;
  concurrencySafe: boolean;
}

/**
 * Convert MCP client tools to RegisteredTool format
 */
export function mcpToolsToRegisteredTools(
  client: MCPClientManager
): MCPRegisteredTool[] {
  const tools: MCPRegisteredTool[] = [];

  for (const connection of client.getAllConnections()) {
    if (connection.state !== 'connected') continue;

    for (const mcpTool of connection.tools || []) {
      if (!mcpTool?.name) continue;
      const piTool = client.getToolsForServer(connection.name).find(
        t => t.name === `mcp__${connection.name}__${mcpTool.name}`
      );

      if (!piTool) continue;

      // Create compact description
      const compactDesc = mcpTool.description
        ? mcpTool.description.substring(0, 150) + (mcpTool.description.length > 150 ? '...' : '')
        : `MCP tool from ${connection.name}`;

      tools.push({
        name: piTool.name,
        tool: piTool,
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        compactDescription: compactDesc,
        serverName: connection.name,
        concurrencySafe: true, // MCP tools are generally safe to parallelize
      });
    }
  }

  return tools;
}

/**
 * Get formatted descriptions for all MCP tools
 */
export function getMCPToolDescriptions(
  client: MCPClientManager
): {
  name: string;
  description: string;
  compactDescription: string;
  serverName: string;
}[] {
  const descriptions: {
    name: string;
    description: string;
    compactDescription: string;
    serverName: string;
  }[] = [];

  for (const connection of client.getAllConnections()) {
    if (connection.state !== 'connected') continue;

    for (const mcpTool of connection.tools || []) {
      if (!mcpTool?.name) continue;
      descriptions.push({
        name: `mcp__${connection.name}__${mcpTool.name}`,
        description: mcpTool.description || `MCP tool from ${connection.name}`,
        compactDescription: mcpTool.description
          ? mcpTool.description.substring(0, 150)
          : `MCP tool from ${connection.name}`,
        serverName: connection.name,
      });
    }
  }

  return descriptions;
}

/**
 * Get MCP connection status summary
 */
export function getMCPStatus(client: MCPClientManager): {
  totalServers: number;
  connectedServers: number;
  totalTools: number;
  servers: {
    name: string;
    state: string;
    toolCount: number;
    error?: string;
  }[];
} {
  const connections = client.getAllConnections();
  const tools = client.getTools();

  return {
    totalServers: connections.length,
    connectedServers: connections.filter(c => c.state === 'connected').length,
    totalTools: tools.length,
    servers: connections.map(c => ({
      name: c.name,
      state: c.state,
      toolCount: c.tools?.length || 0,
      error: c.error,
    })),
  };
}
