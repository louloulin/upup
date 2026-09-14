/**
 * MCP Server Types and Schemas
 *
 * Type definitions for MCP server configurations.
 * Supports stdio, SSE, HTTP, and WebSocket transports.
 */

import { z } from 'zod';

// ============================================================================
// Config Scope
// ============================================================================

/**
 * Configuration scope for MCP servers
 */
export const ConfigScopeSchema = z.enum([
  'local',     // Local/session scope
  'user',      // User-level config
  'project',   // Project-level config (.mcp.json)
  'dynamic',   // Dynamic from plugins
  'enterprise', // Enterprise-managed
  'claudeai',  // Claude.ai integration
  'managed',   // Managed by organization
]);
export type ConfigScope = z.infer<typeof ConfigScopeSchema>;

// ============================================================================
// Transport Types
// ============================================================================

/**
 * Transport type for MCP server communication
 */
export const TransportSchema = z.enum([
  'stdio',  // Standard I/O (child process)
  'sse',    // Server-Sent Events over HTTP
  'http',   // HTTP/REST
  'ws',     // WebSocket
  'sse-ide', // SSE for IDE extensions
]);
export type Transport = z.infer<typeof TransportSchema>;

// ============================================================================
// Stdio Server Config
// ============================================================================

/**
 * Configuration for stdio-based MCP servers (child process)
 */
export const McpStdioServerConfigSchema = z.object({
  /** Transport type (stdio is default) */
  type: z.literal('stdio').optional().default('stdio'),
  /** Command to execute */
  command: z.string().min(1, 'Command cannot be empty'),
  /** Command arguments */
  args: z.array(z.string()).default([]),
  /** Environment variables */
  env: z.record(z.string(), z.string()).optional(),
  /** Auto-connect on startup */
  autoConnect: z.boolean().optional(),
});

export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfigSchema>;

// ============================================================================
// OAuth Config
// ============================================================================

/**
 * OAuth configuration for MCP servers
 */
export const McpOAuthConfigSchema = z.object({
  /** OAuth client ID */
  clientId: z.string().optional(),
  /** Callback port for OAuth redirect */
  callbackPort: z.number().int().positive().optional(),
  /** OAuth authorization server metadata URL */
  authServerMetadataUrl: z.string().url().optional(),
  /** Enable Cross-App Access (XAA) */
  xaa: z.boolean().optional(),
});

export type McpOAuthConfig = z.infer<typeof McpOAuthConfigSchema>;

// ============================================================================
// SSE Server Config
// ============================================================================

/**
 * Configuration for SSE (Server-Sent Events) MCP servers
 */
export const McpSSEServerConfigSchema = z.object({
  /** Transport type */
  type: z.literal('sse'),
  /** Server URL */
  url: z.string().url(),
  /** HTTP headers */
  headers: z.record(z.string(), z.string()).optional(),
  /** Header helper command */
  headersHelper: z.string().optional(),
  /** OAuth configuration */
  oauth: McpOAuthConfigSchema.optional(),
});

export type McpSSEServerConfig = z.infer<typeof McpSSEServerConfigSchema>;

// ============================================================================
// HTTP Server Config
// ============================================================================

/**
 * Configuration for HTTP/REST MCP servers
 */
export const McpHTTPServerConfigSchema = z.object({
  /** Transport type */
  type: z.literal('http'),
  /** Server URL */
  url: z.string().url(),
  /** HTTP headers */
  headers: z.record(z.string(), z.string()).optional(),
  /** Header helper command */
  headersHelper: z.string().optional(),
  /** OAuth configuration */
  oauth: McpOAuthConfigSchema.optional(),
});

export type McpHTTPServerConfig = z.infer<typeof McpHTTPServerConfigSchema>;

// ============================================================================
// WebSocket Server Config
// ============================================================================

/**
 * Configuration for WebSocket MCP servers
 */
export const McpWebSocketServerConfigSchema = z.object({
  /** Transport type */
  type: z.literal('ws'),
  /** Server URL (ws:// or wss://) */
  url: z.string(),
  /** HTTP headers */
  headers: z.record(z.string(), z.string()).optional(),
  /** Authentication token */
  authToken: z.string().optional(),
});

export type McpWebSocketServerConfig = z.infer<typeof McpWebSocketServerConfigSchema>;

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all MCP server config types
 */
export type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHTTPServerConfig
  | McpWebSocketServerConfig;

/**
 * Discriminated union schema for MCP server configs
 */
export const McpServerConfigSchema = z.discriminatedUnion('type', [
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
]);

// ============================================================================
// Server Status
// ============================================================================

/**
 * MCP server connection state
 */
export type MCPServerState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Server connection information
 */
export interface MCPServerConnection {
  /** Server name */
  name: string;
  /** Connection state */
  state: MCPServerState;
  /** Error message if state is 'error' */
  error?: string;
  /** Transport type */
  transport: Transport;
  /** Server URL or command */
  endpoint: string;
}

/**
 * MCP server status information
 */
export interface MCPServerStatus {
  /** Server name */
  name: string;
  /** Connection state */
  state: MCPServerState;
  /** Error message if any */
  error?: string;
  /** Transport type */
  transport: Transport;
  /** Whether auto-connect is enabled */
  autoConnect: boolean;
  /** Last connected timestamp */
  lastConnected?: number;
}

// ============================================================================
// Config File Types
// ============================================================================

/**
 * MCP configuration file format (.mcp.json)
 */
export interface MCPConfigFile {
  /** Server configurations */
  mcpServers?: Record<string, McpStdioServerConfig>;
  /** Config metadata */
  version?: string;
}

/**
 * User-level MCP configuration
 */
export interface MCPUserConfig {
  /** Server configurations by name */
  servers: Record<string, McpServerConfig>;
  /** Config scope */
  scope: ConfigScope;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get transport type from server config
 */
export function getTransportType(config: McpServerConfig): Transport {
  return config.type;
}

/**
 * Check if server config supports OAuth
 */
export function supportsOAuth(config: McpServerConfig): boolean {
  if ('oauth' in config && config.oauth) {
    return true;
  }
  return false;
}

/**
 * Check if server config is stdio-based
 */
export function isStdioConfig(config: McpServerConfig): config is McpStdioServerConfig {
  return config.type === 'stdio';
}

/**
 * Check if server config is HTTP-based (SSE or HTTP)
 */
export function isHttpConfig(config: McpServerConfig): config is McpSSEServerConfig | McpHTTPServerConfig {
  return config.type === 'sse' || config.type === 'http';
}

/**
 * Get server endpoint (URL or command) from config
 */
export function getServerEndpoint(config: McpServerConfig): string {
  if ('url' in config) {
    return config.url;
  }
  if ('command' in config) {
    return config.command;
  }
  return '';
}

/**
 * Get display name for transport type
 */
export function getTransportDisplayName(transport: Transport): string {
  const names: Record<Transport, string> = {
    stdio: 'Standard I/O',
    sse: 'Server-Sent Events',
    http: 'HTTP/REST',
    ws: 'WebSocket',
    'sse-ide': 'SSE (IDE)',
  };
  return names[transport] || transport;
}