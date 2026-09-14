// MCP Server config types
export {
  ConfigScopeSchema,
  TransportSchema,
  McpStdioServerConfigSchema,
  McpOAuthConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpServerConfigSchema,
  type ConfigScope,
  type Transport,
  type McpStdioServerConfig,
  type McpOAuthConfig,
  type McpSSEServerConfig,
  type McpHTTPServerConfig,
  type McpWebSocketServerConfig,
  type McpServerConfig,
  type MCPServerState,
  type MCPServerStatus,
  type MCPConfigFile,
  getTransportType,
  supportsOAuth,
  isStdioConfig,
  isHttpConfig,
  getServerEndpoint,
  getTransportDisplayName,
} from './types.js';

// MCP Client types and exports
export type {
  MCPServerConfig,
  MCPClientConfig,
  MCPConnectionState,
  MCPServerConnection,
  MCPOAuthConfig,
  MCPPrompt,
  MCPPromptArgument,
  MCPPromptResult,
  MCPSamplingMessage,
  MCPSamplingContent,
  SamplingParams,
  SamplingResult,
} from './client.js';
export type { PiMcpTool } from './pi-tool.js';
export { isInvestmentMcpConfigured } from './investment-data.js';
export * from './mcp-ui.js';
export * from './registry.js';
export * from './plugin-integration.js';
export * from './upup-resources.js';

// MCP Client classes and functions
export {
  MCPClientManager,
  loadMCPConfig,
  getDefaultMCPClient,
  initializeMCPClient,
} from './client.js';

// MCP Resource tools
export {
  listMcpResourcesTool,
  readMcpResourceTool,
  LIST_MCP_RESOURCES_DESCRIPTION,
  READ_MCP_RESOURCE_DESCRIPTION,
} from './resource-tools.js';

// Note: auth-tool.ts requires project-specific paths and is not exported
// Note: registry.ts depends on agent-hooks and is not included in this package
