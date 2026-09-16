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
} from './types';

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
} from './client';
export type { PiMcpTool } from './pi-tool';
export { isInvestmentMcpConfigured } from './investment-data';
export * from './registry';
export * from './plugin-integration';
export * from './upup-resources';

// MCP Client classes and functions
export {
  MCPClientManager,
  loadMCPConfig,
  getDefaultMCPClient,
  initializeMCPClient,
} from './client';

// MCP Resource tools
export {
  listMcpResourcesTool,
  readMcpResourceTool,
  LIST_MCP_RESOURCES_DESCRIPTION,
  READ_MCP_RESOURCE_DESCRIPTION,
} from './resource-tools';

// Note: auth-tool.ts requires project-specific paths and is not exported
// Note: registry.ts depends on agent-hooks and is not included in this package
