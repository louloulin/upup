// MCP Client types and exports
export type {
  MCPServerConfig,
  MCPClientConfig,
  MCPConnectionState,
  MCPServerConnection,
} from './client.js';
export type { PiMcpTool } from './pi-tool.js';

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
