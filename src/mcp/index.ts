/**
 * @deprecated Use @upup/mcp instead
 * Re-exports from @upup/mcp for backward compatibility
 */

/**
 * MCP Module - Model Context Protocol Integration
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
} from '@upup/mcp';

export {
  mcpToolsToRegisteredTools,
  getMCPToolDescriptions,
  getMCPStatus,
  type MCPRegisteredTool,
} from '@upup/mcp';
