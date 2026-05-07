/**
 * MCP Module - Model Context Protocol Integration
 *
 * Provides MCP server connection and tool management for Dexter.
 */

export {
  MCPClientManager,
  type MCPServerConfig,
  type MCPClientConfig,
  type MCPConnectionState,
  type MCPServerConnection,
  loadMCPConfig,
  getDefaultMCPClient,
  initializeMCPClient,
} from './client.js';

export {
  mcpToolsToRegisteredTools,
  getMCPToolDescriptions,
  getMCPStatus,
  type MCPRegisteredTool,
} from './registry.js';
