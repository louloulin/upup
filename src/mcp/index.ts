/**
 * @deprecated Use @upup/mcp instead
 * Re-exports from @upup/mcp for backward compatibility.
 *
 * Runtime-coupled helpers (mcp-ui, upup-resources, plugin-integration, registry)
 * remain in src/mcp/ because they depend on root runtime/memory/commands modules.
 */
export {
  MCPClientManager,
  type MCPServerConfig,
  type MCPClientConfig,
  type MCPConnectionState,
  type MCPServerConnection,
  type MCPOAuthConfig,
  type MCPPrompt,
  type MCPPromptArgument,
  type MCPPromptResult,
  type MCPSamplingMessage,
  type MCPSamplingContent,
  type SamplingParams,
  type SamplingResult,
  loadMCPConfig,
  getDefaultMCPClient,
  initializeMCPClient,
} from '@upup/mcp';

// These functions require agent-specific hooks and stay in src/mcp/
export {
  mcpToolsToRegisteredTools,
  getMCPToolDescriptions,
  getMCPStatus,
  type MCPRegisteredTool,
} from './registry.js';
