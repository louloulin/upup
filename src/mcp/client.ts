/**
 * MCP Client - Integration with @modelcontextprotocol/sdk
 *
 * This module provides MCP server connection and tool management.
 * Uses the official MCP SDK for protocol handling.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Client as MCPClientType, Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  /** Auto-connect on startup */
  autoConnect?: boolean;
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
export class MCPClientManager {
  private clients: Map<string, MCPClientType> = new Map();
  private transports: Map<string, any> = new Map();
  private connections: Map<string, MCPServerConnection> = new Map();
  private config: MCPClientConfig;
  private tools: StructuredToolInterface[] = [];
  private toolCallbacks: Set<(tools: StructuredToolInterface[]) => void> = new Set();

  constructor(config: MCPClientConfig) {
    this.config = config;
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverConfig: MCPServerConfig): Promise<void> {
    const { name, command, args, env, url, autoConnect = true } = serverConfig;

    if (this.clients.has(name)) {
      console.log(`[MCP] Server ${name} already connected`);
      return;
    }

    this.updateConnectionState(name, 'connecting');

    try {
      // Create client
      const client = new Client({
        name: this.config.clientInfo?.name || 'Dexter',
        version: this.config.clientInfo?.version || '1.0.0',
      });

      let transport: any;

      if (command) {
        // Stdio transport (local process)
        transport = new StdioClientTransport({
          command,
          args: args || [],
          env: env ? { ...process.env, ...env } : undefined,
        });
      } else if (url) {
        // SSE transport (remote server)
        transport = new SSEClientTransport(new URL(url));
      } else {
        throw new Error('Server must have either command or url');
      }

      // Connect
      await client.connect(transport);

      // Store references
      this.clients.set(name, client);
      this.transports.set(name, transport);

      // Set up tool notification handler
      client.setRequestHandler(
        { method: 'notifications/tools/list_changed' },
        async () => {
          console.log(`[MCP] Tools changed for server ${name}`);
          await this.refreshTools(name);
        }
      );

      // Initial tool discovery
      await this.refreshTools(name);

      this.updateConnectionState(name, 'connected');
      console.log(`[MCP] Connected to server: ${name}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateConnectionState(name, 'error', message);
      console.error(`[MCP] Failed to connect to ${name}:`, message);
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
        console.error(`[MCP] Error closing ${serverName}:`, error);
      }
      this.clients.delete(serverName);
    }

    if (transport) {
      this.transports.delete(serverName);
    }

    this.updateConnectionState(serverName, 'disconnected');
    console.log(`[MCP] Disconnected from server: ${serverName}`);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
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
        { tools: [] as any }
      );

      const connection = this.connections.get(serverName);
      if (connection) {
        connection.tools = toolsResult.tools || [];
      }

      // Convert MCP tools to LangChain tools
      await this.updateLangChainTools(serverName);

    } catch (error) {
      console.error(`[MCP] Failed to refresh tools from ${serverName}:`, error);
    }
  }

  /**
   * Convert MCP tool to LangChain DynamicStructuredTool
   */
  private mcpToolToLangChainTool(
    mcpTool: MCPTool,
    serverName: string,
    client: MCPClientType
  ): StructuredToolInterface {
    const toolName = `mcp__${serverName}__${mcpTool.name}`;
    const description = mcpTool.description || `MCP tool: ${mcpTool.name}`;

    // Parse input schema
    let schema: z.ZodType<any> = z.object({});
    if (mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object') {
      const schemaObj = mcpTool.inputSchema as Record<string, any>;
      if (schemaObj.type === 'object' && schemaObj.properties) {
        const properties: Record<string, z.ZodType<any>> = {};
        const required: string[] = schemaObj.required || [];

        for (const [key, prop] of Object.entries(schemaObj.properties)) {
          const propObj = prop as Record<string, any>;
          let zodType: z.ZodType<any>;

          switch (propObj.type) {
            case 'string':
              zodType = z.string();
              break;
            case 'number':
              zodType = z.number();
              break;
            case 'boolean':
              zodType = z.boolean();
              break;
            case 'array':
              zodType = z.array(z.any());
              break;
            case 'object':
              zodType = z.record(z.any());
              break;
            default:
              zodType = z.any();
          }

          if (!required.includes(key)) {
            zodType = zodType.optional();
          }

          properties[key] = zodType;
        }

        schema = z.object(properties);
      }
    }

    return new DynamicStructuredTool({
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
   * Update LangChain tools from all servers
   */
  private async updateLangChainTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const connection = this.connections.get(serverName);
    if (!client || !connection) return;

    const langChainTools = connection.tools.map(tool =>
      this.mcpToolToLangChainTool(tool, serverName, client)
    );

    // Update or add tools for this server
    this.tools = this.tools.filter(t => !t.name.startsWith(`mcp__${serverName}__`));
    this.tools.push(...langChainTools);

    // Notify listeners
    this.toolCallbacks.forEach(cb => cb(this.tools));
  }

  /**
   * Get all LangChain tools from all connected servers
   */
  getTools(): StructuredToolInterface[] {
    return this.tools;
  }

  /**
   * Get tools for a specific server
   */
  getToolsForServer(serverName: string): StructuredToolInterface[] {
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
  onToolsChange(callback: (tools: StructuredToolInterface[]) => void): () => void {
    this.toolCallbacks.add(callback);
    return () => this.toolCallbacks.delete(callback);
  }

  /**
   * Connect to all servers in config
   */
  async connectAll(): Promise<void> {
    const autoConnectServers = this.config.servers.filter(s => s.autoConnect !== false);
    await Promise.allSettled(
      autoConnectServers.map(server => this.connect(server))
    );
  }
}

// Default client instance
let defaultClient: MCPClientManager | null = null;

/**
 * Load MCP configuration from file
 */
export function loadMCPConfig(configPath?: string): MCPClientConfig {
  const path = configPath || join(process.cwd(), '.dexter', 'mcp-config.json');

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Return empty config if file doesn't exist
    return { servers: [] };
  }
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
