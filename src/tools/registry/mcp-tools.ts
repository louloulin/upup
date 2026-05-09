/**
 * MCP (Model Context Protocol) tool registrations.
 */

import type { RegisteredTool } from './types.js';
import { networkMetadata, systemMetadata } from './types.js';
import { getMCPStatus, mcpToolsToRegisteredTools } from '../../mcp/index.js';
import { getDefaultMCPClient } from '../../mcp/client.js';
import { listMcpResourcesTool, readMcpResourceTool, LIST_MCP_RESOURCES_DESCRIPTION, READ_MCP_RESOURCE_DESCRIPTION } from '../../mcp/resource-tools.js';
import { createMcpAuthSetTool, createMcpAuthGetTool, createMcpAuthClearTool, MCP_AUTH_SET_DESCRIPTION, MCP_AUTH_GET_DESCRIPTION, MCP_AUTH_CLEAR_DESCRIPTION } from '../../mcp/auth-tool.js';
import { info } from '../../utils/logging/logger.js';

export function loadMCPTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];

  // Add MCP tools from configured servers
  try {
    const mcpClient = getDefaultMCPClient();
    const mcpTools = mcpToolsToRegisteredTools(mcpClient);

    for (const mcpTool of mcpTools) {
      tools.push({
        name: mcpTool.name,
        tool: mcpTool.tool,
        description: mcpTool.description,
        compactDescription: mcpTool.compactDescription,
        concurrencySafe: mcpTool.concurrencySafe,
      });
    }

    // Log MCP status for debugging
    const status = getMCPStatus(mcpClient);
    if (status.connectedServers > 0) {
      info('tools', `MCP: ${status.connectedServers}/${status.totalServers} servers connected, ${status.totalTools} tools available`);
    }
  } catch {
    // MCP initialization failed, tools will be empty
    info('tools', 'MCP not configured or initialization failed');
  }

  // MCP resource tools (always available, even when no servers configured)
  tools.push({
    name: 'list_mcp_resources',
    tool: listMcpResourcesTool,
    description: LIST_MCP_RESOURCES_DESCRIPTION,
    compactDescription: 'List resources from connected MCP servers.',
    concurrencySafe: true,
    concurrencyMetadata: networkMetadata(),
  });

  tools.push({
    name: 'read_mcp_resource',
    tool: readMcpResourceTool,
    description: READ_MCP_RESOURCE_DESCRIPTION,
    compactDescription: 'Read a specific resource from an MCP server by URI.',
    concurrencySafe: true,
    concurrencyMetadata: networkMetadata(),
  });

  // MCP Auth tools
  const mcpAuthSetTool = createMcpAuthSetTool();
  const mcpAuthGetTool = createMcpAuthGetTool();
  const mcpAuthClearTool = createMcpAuthClearTool();

  tools.push({
    name: 'mcp_auth_set',
    tool: mcpAuthSetTool,
    description: MCP_AUTH_SET_DESCRIPTION,
    compactDescription: 'Set authentication credentials for an MCP server.',
    concurrencySafe: false,
    concurrencyMetadata: systemMetadata(),
  });

  tools.push({
    name: 'mcp_auth_get',
    tool: mcpAuthGetTool,
    description: MCP_AUTH_GET_DESCRIPTION,
    compactDescription: 'Get authentication config for MCP servers.',
    concurrencySafe: true,
    concurrencyMetadata: systemMetadata(),
  });

  tools.push({
    name: 'mcp_auth_clear',
    tool: mcpAuthClearTool,
    description: MCP_AUTH_CLEAR_DESCRIPTION,
    compactDescription: 'Clear authentication for an MCP server.',
    concurrencySafe: false,
    concurrencyMetadata: systemMetadata(),
  });

  return tools;
}
