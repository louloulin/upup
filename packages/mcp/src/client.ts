/**
 * MCP Client - Integration with @modelcontextprotocol/sdk
 *
 * This module provides MCP server connection and tool management.
 * Uses the official MCP SDK for protocol handling.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';
import { ToolListChangedNotificationSchema, ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PiTool } from '../runtime/pi/tool.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { info, error as logError } from '@upup/utils/logging';
import {
  defaultTokenStorage,
  isTokenExpired,
  type OAuthTokens,
} from './oauth.js';

/**
 * OAuth configuration for MCP server
 */
export interface MCPOAuthConfig {
  /** OAuth client ID */
  clientId?: string;
  /** OAuth client secret */
  clientSecret?: string;
  /** Authorization server URL */
  authServerUrl?: string;
  /** Token server URL */
  tokenServerUrl?: string;
  /** OAuth scopes */
  scopes?: string[];
}

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  name: string;
  /** Stdio transport config */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** SSE/HTTP transport config */
  url?: string;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Auto-connect on startup */
  autoConnect?: boolean;
  /** OAuth configuration */
  oauth?: MCPOAuthConfig;
}

/**
 * MCP Client configuration
 */
export interface MCPClientConfig {
  servers: MCPServerConfig[];
  clientInfo?: {
    name: string;
    version: string;
  };
}

/**
 * MCP Client connection state
 */
export type MCPConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * MCP Server connection info
 */
export interface MCPServerConnection {
  name: string;
  state: MCPConnectionState;
  tools: MCPTool[];
  error?: string;
}

/**
 * MCP Client wrapper
 * Manages connections to MCP servers and tool discovery
 */
export class MCPClientManager extends EventEmitter {
  private clients: Map<string, any> = new Map();
  private transports: Map<string, any> = new Map();
  private connections: Map<string, MCPServerConnection> = new Map();
  private config: MCPClientConfig;
  private tools: PiTool[] = [];
  private toolCallbacks: Set<(tools: PiTool[]) => void> = new Set();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor(config: MCPClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverConfig: MCPServerConfig): Promise<void> {
    const { name, command, args, env, url, headers, oauth } = serverConfig;

    if (this.clients.has(name)) {
      info('mcp', `Server ${name} already connected`);
      return;
    }

    this.updateConnectionState(name, 'connecting');

    try {
      // Create client
      const client = new Client({
        name: this.config.clientInfo?.name || 'UpUp',
        version: this.config.clientInfo?.version || '1.0.0',
      });

      // Handle OAuth authentication if configured
      const authHeaders = await this.getAuthHeaders(name, oauth);

      let transport: any;

      if (command) {
        // Stdio transport (local process)
        const envRecord: Record<string, string> = {};
        if (env) {
          for (const [key, value] of Object.entries(env)) {
            envRecord[key] = value;
          }
        }
        // Add OAuth token to env if available
        if (authHeaders.Authorization) {
          envRecord['MCP_AUTH_TOKEN'] = authHeaders.Authorization.replace('Bearer ', '');
        }
        transport = new StdioClientTransport({
          command,
          args: args || [],
          env: Object.keys(envRecord).length > 0 ? envRecord : undefined,
        });
      } else if (url) {
        // SSE transport (remote server) with auth headers
        const urlObj = new URL(url);
        const mergedHeaders: Record<string, string> = { ...headers };
        if (authHeaders.Authorization) {
          mergedHeaders['Authorization'] = authHeaders.Authorization;
        }
        transport = new SSEClientTransport(urlObj, {
          requestInit: {
            headers: mergedHeaders,
          },
        });
      } else {
        throw new Error('Server must have either command or url');
      }

      // Connect
      await client.connect(transport);

      // Store references
      this.clients.set(name, client);
      this.transports.set(name, transport);

      // Set up tool notification handler
      client.setNotificationHandler(
        ToolListChangedNotificationSchema,
        async () => {
          info('mcp', `Tools changed for server ${name}`);
          await this.refreshTools(name);
        }
      );

      // Set up resource list change notification handler
      try {
        client.setNotificationHandler(
          ResourceListChangedNotificationSchema,
          async () => {
            info('mcp', `Resources changed for server ${name}`);
            this.emit('resourcesChanged', name);
          }
        );
      } catch {
        // Server may not support resource notifications — skip silently
      }

      // Initial tool discovery
      await this.refreshTools(name);

      this.updateConnectionState(name, 'connected');
      info('mcp', `Connected to server: ${name}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateConnectionState(name, 'error', message);
      logError('mcp', `Failed to connect to ${name}: ${message}`);
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const transport = this.transports.get(serverName);

    if (client) {
      try {
        await client.close();
      } catch (error) {
        logError('mcp', `Error closing ${serverName}: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.clients.delete(serverName);
    }

    if (transport) {
      this.transports.delete(serverName);
    }

    this.updateConnectionState(serverName, 'disconnected');
    info('mcp', `Disconnected from server: ${serverName}`);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    this.stopHealthMonitoring();
    const names = Array.from(this.clients.keys());
    await Promise.all(names.map(name => this.disconnect(name)));
  }

  /**
   * Refresh tools from a server
   */
  private async refreshTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) return;

    try {
      const toolsResult = await client.request(
        { method: 'tools/list' },
        { tools: [] }
      );

      const connection = this.connections.get(serverName);
      if (connection) {
        connection.tools = toolsResult.tools || [];
      }

      // Convert MCP tools to Pi-compatible tools.
      await this.updatePiTools(serverName);

    } catch (error) {
      logError('mcp', `Failed to refresh tools from ${serverName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert MCP tool to the Pi-compatible tool contract.
   */
  private mcpToolToPiTool(
    mcpTool: MCPTool,
    serverName: string,
    client: any
  ): PiTool {
    const toolName = `mcp__${serverName}__${mcpTool.name}`;
    const description = mcpTool.description || `MCP tool: ${mcpTool.name}`;

    // Parse input schema
    let schema = z.object({});
    if (mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object') {
      const schemaObj = mcpTool.inputSchema as Record<string, any>;
      if (schemaObj.type === 'object' && schemaObj.properties) {
        const properties: Record<string, any> = {};
        const required: string[] = schemaObj.required || [];

        for (const [key, prop] of Object.entries(schemaObj.properties)) {
          const propObj = prop as Record<string, any>;

          switch (propObj.type) {
            case 'string':
              properties[key] = z.string();
              break;
            case 'number':
              properties[key] = z.number();
              break;
            case 'boolean':
              properties[key] = z.boolean();
              break;
            case 'array':
              properties[key] = z.array(z.any());
              break;
            case 'object':
              properties[key] = z.record(z.string(), z.any());
              break;
            default:
              properties[key] = z.any();
          }
        }

        schema = z.object(properties);
      }
    }

    return new PiTool({
      name: toolName,
      description,
      schema,
      async func(args: Record<string, unknown>) {
        try {
          const result = await client.request(
            { method: 'tools/call' },
            {
              name: mcpTool.name,
              arguments: args,
            }
          );

          // Handle result
          const content = result.content;
          if (Array.isArray(content)) {
            return content.map(c => c.text || JSON.stringify(c)).join('\n');
          }
          return JSON.stringify(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`MCP tool ${toolName} failed: ${message}`);
        }
      },
    });
  }

  /**
   * Update Pi tools from all servers
   */
  private async updatePiTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const connection = this.connections.get(serverName);
    if (!client || !connection) return;

    const piTools = connection.tools.map(tool =>
      this.mcpToolToPiTool(tool, serverName, client)
    );

    // Update or add tools for this server
    this.tools = this.tools.filter(t => !t.name.startsWith(`mcp__${serverName}__`));
    this.tools.push(...piTools);

    // Notify listeners
    this.toolCallbacks.forEach(cb => cb(this.tools));
  }

  /**
   * List available resources from a specific server or all connected servers.
   */
  async listResources(serverName?: string): Promise<Array<{ server: string; resources: any[] }>> {
    const results: Array<{ server: string; resources: any[] }> = [];

    const servers = serverName
      ? [[serverName, this.clients.get(serverName)] as const]
      : Array.from(this.clients.entries());

    for (const [name, client] of servers) {
      if (!client) continue;
      try {
        const result = await client.request(
          { method: 'resources/list' },
          { resources: [] }
        );
        results.push({ server: name, resources: result.resources || [] });
      } catch (error) {
        // Server doesn't support resources — skip silently
        info('mcp', `Server ${name} does not support resources or returned error`);
      }
    }

    return results;
  }

  /**
   * Read a specific resource from an MCP server.
   */
  async readResource(uri: string, serverName?: string): Promise<{ server: string; contents: any[] }> {
    // Find the server that has this resource
    const client = serverName
      ? this.clients.get(serverName)
      : await this.findClientForResource(uri);

    if (!client) {
      throw new Error(`No MCP server found for resource URI: ${uri}`);
    }

    const result = await client.request(
      { method: 'resources/read' },
      { uri }
    );

    return {
      server: serverName || 'auto-detected',
      contents: result.contents || [],
    };
  }

  /**
   * Find which server has a given resource URI.
   */
  private async findClientForResource(uri: string): Promise<any | undefined> {
    for (const [name, client] of this.clients.entries()) {
      try {
        const result = await client.request(
          { method: 'resources/list' },
          { resources: [] }
        );
        const resources = result.resources || [];
        if (resources.some((r: any) => r.uri === uri)) {
          return client;
        }
      } catch {
        // Skip servers that don't support resources
      }
    }
    return undefined;
  }

  /**
   * Get all Pi tools from all connected servers
   */
  getTools(): PiTool[] {
    return this.tools;
  }

  /**
   * Get tools for a specific server
   */
  getToolsForServer(serverName: string): PiTool[] {
    return this.tools.filter(t => t.name.startsWith(`mcp__${serverName}__`));
  }

  /**
   * Get connection state for a server
   */
  getConnectionState(serverName: string): MCPServerConnection | undefined {
    return this.connections.get(serverName);
  }

  /**
   * Get all connection states
   */
  getAllConnections(): MCPServerConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Update connection state
   */
  private updateConnectionState(
    serverName: string,
    state: MCPConnectionState,
    error?: string
  ): void {
    const existing = this.connections.get(serverName);
    this.connections.set(serverName, {
      name: serverName,
      state,
      tools: existing?.tools || [],
      error,
    });
  }

  /**
   * Subscribe to tool updates
   */
  onToolsChange(callback: (tools: PiTool[]) => void): () => void {
    this.toolCallbacks.add(callback);
    return () => this.toolCallbacks.delete(callback);
  }

  /**
   * Subscribe to resource change notifications from a server.
   * The callback is invoked when the server sends ResourceListChangedNotification.
   */
  onResourcesChanged(callback: (serverName: string) => void): () => void {
    const handler = (serverName: string) => callback(serverName);
    this.on('resourcesChanged', handler);
    return () => this.off('resourcesChanged', handler);
  }

  /**
   * Subscribe to updates for a specific resource URI.
   * Polls the resource and calls back when content changes.
   */
  subscribeToResource(
    uri: string,
    callback: (uri: string, content: unknown) => void,
    pollIntervalMs: number = 30000
  ): () => void {
    let lastContent: string = '';
    let interval: ReturnType<typeof setInterval> | null = setInterval(async () => {
      try {
        const result = await this.readResource(uri);
        const contentStr = JSON.stringify(result.contents);
        if (contentStr !== lastContent) {
          lastContent = contentStr;
          callback(uri, result.contents);
        }
      } catch {
        // Resource may be temporarily unavailable
      }
    }, pollIntervalMs);

    return () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
  }

  /**
   * Connect to all servers in config
   */
  async connectAll(): Promise<void> {
    const autoConnectServers = this.config.servers.filter(s => s.autoConnect !== false);
    await Promise.allSettled(
      autoConnectServers.map(server => this.connect(server))
    );
    // Start health monitoring after connecting
    this.startHealthMonitoring();
  }

  /**
   * Start periodic health checks for all connected servers.
   * Detects dead servers and triggers automatic reconnection.
   */
  startHealthMonitoring(): void {
    if (this.healthCheckInterval) return;
    this.healthCheckInterval = setInterval(() => this.runHealthChecks(), this.HEALTH_CHECK_INTERVAL_MS);
    info('mcp', 'Health monitoring started');
  }

  /**
   * Stop health monitoring.
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      info('mcp', 'Health monitoring stopped');
    }
  }

  /**
   * Run health checks on all connected servers.
   * If a server fails to respond, mark it disconnected and attempt reconnection.
   */
  private async runHealthChecks(): Promise<void> {
    for (const [name, connection] of this.connections.entries()) {
      if (connection.state !== 'connected') continue;

      const client = this.clients.get(name);
      if (!client) continue;

      try {
        // Ping the server by listing tools (lightweight health check)
        await client.request(
          { method: 'tools/list' },
          { tools: [] }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logError('mcp', `Health check failed for ${name}: ${message}`);
        this.updateConnectionState(name, 'error', message);

        // Attempt automatic reconnection
        await this.attemptReconnect(name);
      }
    }
  }

  /**
   * Attempt to reconnect to a disconnected/errored server.
   * Exponential backoff with max attempts.
   */
  private async attemptReconnect(serverName: string): Promise<void> {
    const attempts = this.reconnectAttempts.get(serverName) ?? 0;
    if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      logError('mcp', `Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached for ${serverName}`);
      return;
    }

    this.reconnectAttempts.set(serverName, attempts + 1);
    const delayMs = Math.min(1000 * Math.pow(2, attempts), 30000); // 1s, 2s, 4s...
    info('mcp', `Reconnecting to ${serverName} (attempt ${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS}, delay ${delayMs}ms)`);

    // Wait with exponential backoff
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const serverConfig = this.config.servers.find(s => s.name === serverName);
    if (!serverConfig) return;

    try {
      // Disconnect first to clean up stale state
      await this.disconnect(serverName);
      await this.connect(serverConfig);
      this.reconnectAttempts.set(serverName, 0); // Reset on success
      info('mcp', `Successfully reconnected to ${serverName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError('mcp', `Reconnect failed for ${serverName}: ${message}`);
    }
  }

  /**
   * List available prompts from a server or all connected servers.
   */
  async listPrompts(serverName?: string): Promise<Array<{ server: string; prompts: MCPPrompt[] }>> {
    const results: Array<{ server: string; prompts: MCPPrompt[] }> = [];

    const servers = serverName
      ? [[serverName, this.clients.get(serverName)] as const]
      : Array.from(this.clients.entries());

    for (const [name, client] of servers) {
      if (!client) continue;
      try {
        const result = await client.request(
          { method: 'prompts/list' },
          { prompts: [] }
        );
        results.push({ server: name, prompts: result.prompts || [] });
      } catch {
        info('mcp', `Server ${name} does not support prompts`);
      }
    }

    return results;
  }

  /**
   * Get a specific prompt from an MCP server.
   */
  async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<MCPPromptResult> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    const result = await client.request(
      { method: 'prompts/get' },
      { name: promptName, arguments: args || {} }
    );

    return {
      server: serverName,
      description: result.description,
      messages: result.messages || [],
    };
  }

  /**
   * Request a sampling completion from an MCP server.
   */
  async createSamplingMessage(
    serverName: string,
    params: SamplingParams
  ): Promise<SamplingResult> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    try {
      const result = await client.request(
        { method: 'sampling/createMessage' },
        {
          method: 'sampling/createMessage',
          params: {
            messages: params.messages,
            systemPrompt: params.systemPrompt,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            stopSequences: params.stopSequences,
          },
        }
      );

      return {
        server: serverName,
        content: result.content,
        model: result.model,
        stopReason: result.stopReason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Sampling failed for ${serverName}: ${message}`);
    }
  }

  /**
   * Get authorization headers for OAuth authentication
   */
  private async getAuthHeaders(
    serverName: string,
    oauth?: MCPOAuthConfig
  ): Promise<Record<string, string>> {
    if (!oauth) {
      return {};
    }

    try {
      // Try to get cached tokens
      let tokens = await defaultTokenStorage.get(serverName);

      // Check if token needs refresh
      if (tokens && isTokenExpired(tokens)) {
        if (tokens.refreshToken && oauth.tokenServerUrl) {
          // Refresh the token
          tokens = await this.refreshOAuthToken(serverName, oauth, tokens.refreshToken);
        } else {
          // Token expired without refresh, need new auth
          tokens = null;
        }
      }

      if (tokens?.accessToken) {
        return { Authorization: `Bearer ${tokens.accessToken}` };
      }

      // No valid tokens, log warning
      info('mcp', `No OAuth tokens for server ${serverName}, proceeding without auth`);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('mcp', `OAuth auth error for ${serverName}: ${message}`);
      return {};
    }
  }

  /**
   * Refresh OAuth token
   */
  private async refreshOAuthToken(
    serverName: string,
    oauth: MCPOAuthConfig,
    refreshToken: string
  ): Promise<OAuthTokens | null> {
    if (!oauth.tokenServerUrl) {
      return null;
    }

    try {
      const response = await fetch(oauth.tokenServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: oauth.clientId || '',
        }),
      });

      if (!response.ok) {
        logError('mcp', `Token refresh failed for ${serverName}: ${response.status}`);
        return null;
      }

      const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
      };

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        tokenType: data.token_type,
        expiresAt: data.expires_in
          ? Date.now() + data.expires_in * 1000
          : undefined,
      };

      // Store updated tokens
      await defaultTokenStorage.set(serverName, tokens);

      return tokens;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError('mcp', `Token refresh error for ${serverName}: ${message}`);
      return null;
    }
  }
}

// Default client instance
let defaultClient: MCPClientManager | null = null;

/**
 * Load MCP configuration from file
 */
export function loadMCPConfig(configPath?: string): MCPClientConfig {
  const path = configPath || join(process.cwd(), '.upup', 'mcp-config.json');

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);

    // Handle different config formats
    // Format 1: MCP official format (servers as object)
    if (parsed.servers && typeof parsed.servers === 'object' && !Array.isArray(parsed.servers)) {
      const servers: MCPServerConfig[] = Object.entries(parsed.servers).map(([name, config]) => {
        const cfg = config as Record<string, unknown>;
        return {
          name,
          command: cfg.command as string,
          args: cfg.args as string[],
          env: cfg.env as Record<string, string>,
          url: cfg.url as string,
          autoConnect: cfg.autoConnect !== false,
        };
      });
      return { servers };
    }

    // Format 2: Direct array format
    if (Array.isArray(parsed.servers)) {
      return parsed as MCPClientConfig;
    }

    return { servers: [] };
  } catch {
    // Return empty config if file doesn't exist
    return { servers: [] };
  }
}

/**
 * MCP Prompt definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

/**
 * MCP Prompt argument
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * MCP Prompt result
 */
export interface MCPPromptResult {
  server: string;
  description?: string;
  messages: MCPSamplingMessage[];
}

/**
 * Sampling message
 */
export interface MCPSamplingMessage {
  role: 'user' | 'assistant';
  content: MCPSamplingContent;
}

/**
 * Sampling content
 */
export interface MCPSamplingContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Sampling parameters
 */
export interface SamplingParams {
  messages: MCPSamplingMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

/**
 * Sampling result
 */
export interface SamplingResult {
  server: string;
  content: MCPSamplingContent;
  model?: string;
  stopReason?: string;
}

/**
 * Get or create default MCP client
 */
export function getDefaultMCPClient(): MCPClientManager {
  if (!defaultClient) {
    const config = loadMCPConfig();
    defaultClient = new MCPClientManager(config);
  }
  return defaultClient;
}

/**
 * Initialize MCP client and connect to servers
 */
export async function initializeMCPClient(config?: MCPClientConfig): Promise<MCPClientManager> {
  const client = config
    ? new MCPClientManager(config)
    : getDefaultMCPClient();

  await client.connectAll();
  return client;
}
