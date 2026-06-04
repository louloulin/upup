/**
 * MCP Tool Registry Integration
 *
 * Converts MCP tools to UpUp's RegisteredTool format for integration
 * with the tool registry.
 */

import type { StructuredToolInterface } from '@langchain/core/tools';
import type { MCPClientManager, MCPServerConnection } from './client.js';
import { useMergedClients } from '../hooks/agent-hooks.js';

/**
 * MCP Registered Tool format
 */
export interface MCPRegisteredTool {
  name: string;
  tool: StructuredToolInterface;
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

  // Register connected servers with the merged client registry
  const mergedClients = useMergedClients();

  for (const connection of client.getAllConnections()) {
    if (connection.state !== 'connected') continue;

    // Register this server's tools in the merged registry
    const serverToolNames = (connection.tools || []).map(t => t?.name ? `mcp__${connection.name}__${t.name}` : null).filter((n): n is string => n !== null);
    mergedClients.register(connection.name, serverToolNames);

    for (const mcpTool of connection.tools || []) {
      if (!mcpTool?.name) continue;
      const langChainTool = client.getToolsForServer(connection.name).find(
        t => t.name === `mcp__${connection.name}__${mcpTool.name}`
      );

      if (!langChainTool) continue;

      // Create compact description
      const compactDesc = mcpTool.description
        ? mcpTool.description.substring(0, 150) + (mcpTool.description.length > 150 ? '...' : '')
        : `MCP tool from ${connection.name}`;

      tools.push({
        name: langChainTool.name,
        tool: langChainTool,
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


// ============================================================================
// Self-registration with public port registry
// ============================================================================
// Allows packages/commands/ to access MCP status without a fragile
// 4-level `await import('../../../../../src/mcp/registry.js')` path.
// Builds the status from the same MergedClientRegistry that the rest of the
// module already uses.
import {
  registerMcpRegistryPort,
  type McpRegistryPort,
  type McpStatus,
} from '../agent/agent-port.js';

function registerSelf(): void {
  const port: McpRegistryPort = {
    getStatus(): McpStatus {
      const merged = useMergedClients();
      const clients = merged.getClients();
      const totalServers = clients.length;
      const connectedServers = clients.filter((c) => c.connected).length;
      const totalTools = clients.reduce((sum, c) => sum + c.tools.length, 0);
      const servers = clients.map((c) => ({
        name: c.name,
        state: c.connected ? 'connected' : 'disconnected',
        toolCount: c.tools.length,
      }));
      return { totalServers, connectedServers, totalTools, servers };
    },
  };
  registerMcpRegistryPort(port);
}
registerSelf();
