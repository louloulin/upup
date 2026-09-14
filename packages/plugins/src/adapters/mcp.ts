/**
 * UpUp Plugin System — MCP Runtime Adapter
 *
 * Loads external plugins via MCP (Model Context Protocol).
 * Provides process isolation for external data sources and services.
 */

import { info, warn } from '@upup/utils/logging';
import type {
  PluginAdapter,
  PluginManifest,
  LoadedPlugin,
  UpUpPluginApi,
  PluginService,
  AgentTool,
  HookHandler,
} from '../types.js';

// MCP client interface (for external MCP server connections)
interface McpClient {
  listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
}

// Lazy load MCP client
let mcpClients: Map<string, McpClient> = new Map();

/**
 * MCP Adapter — external process isolation
 */
export class McpAdapter implements PluginAdapter {
  readonly runtime = 'mcp' as const;

  canLoad(manifest: PluginManifest): boolean {
    return manifest.runtime === 'mcp';
  }

  async load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin> {
    const config = manifest.runtimeConfig ?? {};
    const serverUrl = config.url as string;
    const serverName = (config.name as string) ?? manifest.name;

    if (!serverUrl) {
      throw new Error(`MCP plugin ${manifest.id} requires 'url' in runtimeConfig`);
    }

    info('default', `Loading MCP plugin: ${manifest.name} from ${serverUrl}`);

    try {
      // Create MCP client connection (placeholder implementation)
      // In production, this would use the real MCP client
      const client: McpClient = {
        listTools: async () => {
          // MCP tool discovery would go here
          return [];
        },
        callTool: async (name: string, args: Record<string, unknown>) => {
          // MCP tool call would go here
          return { name, args, result: 'not implemented' };
        },
        disconnect: async () => {
          mcpClients.delete(manifest.id);
        },
      };
      mcpClients.set(manifest.id, client);

      // Register tools from MCP
      const tools = await this.registerMcpTools(client, manifest);

      // MCP plugins don't have local services (they run externally)
      const services: PluginService[] = [];

      // MCP has limited hook support (via protocol)
      const hooks = new Map<string, HookHandler[]>();

      return {
        id: manifest.id,
        runtime: this.runtime,
        manifest,
        instance: client,
        services,
        tools,
        hooks,
      };
    } catch (err) {
      throw new Error(`Failed to load MCP plugin ${manifest.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Register MCP tools as UpUp tools
   */
  private async registerMcpTools(client: McpClient, manifest: PluginManifest): Promise<AgentTool[]> {
    const tools: AgentTool[] = [];

    try {
      // Get tools list from MCP server
      const mcpTools = await client.listTools();

      for (const mcpTool of mcpTools) {
        const tool: AgentTool = {
          name: `${manifest.id}:${mcpTool.name}`,
          description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
          schema: mcpTool.inputSchema as Record<string, unknown>,
          execute: async (args: Record<string, unknown>) => {
            return client.callTool(mcpTool.name, args);
          },
        };
        tools.push(tool);
      }
    } catch (err) {
      warn('default', `Failed to list MCP tools for ${manifest.id}: ${(err as Error).message}`);
    }

    return tools;
  }

  async unload(plugin: LoadedPlugin): Promise<void> {
    const client = mcpClients.get(plugin.id);
    if (client) {
      try {
        await client.disconnect();
      } catch (err) {
        warn('default', `Error disconnecting MCP client ${plugin.id}: ${(err as Error).message}`);
      }
    }
    mcpClients.delete(plugin.id);
  }
}