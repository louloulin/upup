/**
 * MCP Server Commands
 *
 * CLI commands for managing MCP servers.
 *
 * Features:
 * - `mcp serve` - Start an MCP server
 * - `mcp list` - List configured servers
 * - `mcp status` - Show server connection status
 * - `mcp add` - Add a new server configuration
 * - `mcp remove` - Remove a server configuration
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { MCPClientManager } from '@upup/mcp';
import {
  MCPServerConfig,
  ConfigScope,
  ConfigScopeSchema,
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
} from '@upup/mcp';
import { upupPath } from '../utils/paths.js';

// ============================================================================
// Types
// ============================================================================

export interface MCPCommandOptions {
  configPath?: string;
  scope?: ConfigScope;
  verbose?: boolean;
}

export interface ServeOptions extends MCPCommandOptions {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

// ============================================================================
// Type Conversion Helpers
// ============================================================================

/**
 * Convert Record<string, MCPServerConfig> to legacy MCPServerConfig[] format
 */
function toLegacyServerConfigs(servers: Record<string, MCPServerConfig>): { name: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; autoConnect?: boolean }[] {
  return Object.entries(servers).map(([name, config]) => {
    if (config.type === 'stdio') {
      return { name, command: config.command, args: config.args, env: config.env, autoConnect: config.autoConnect };
    }
    return { name, url: config.url };
  });
}

// ============================================================================
// Config Management
// ============================================================================

const DEFAULT_USER_CONFIG_PATH = join(homedir(), '.config', 'upup', 'mcp-servers.json');
const DEFAULT_PROJECT_CONFIG_PATH = '.mcp.json';

/**
 * Load MCP server configurations from file
 */
export function loadMCPConfig(configPath?: string): Record<string, MCPServerConfig> {
  const paths = [
    configPath,
    DEFAULT_PROJECT_CONFIG_PATH,
    DEFAULT_USER_CONFIG_PATH,
  ].filter(Boolean) as string[];

  for (const path of paths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8');
        const config = JSON.parse(content);
        return config.mcpServers || config.servers || {};
      } catch {
        // Skip corrupted files
      }
    }
  }

  return {};
}

/**
 * Save MCP server configurations to file
 */
export function saveMCPConfig(
  servers: Record<string, MCPServerConfig>,
  configPath: string
): void {
  const dir = join(configPath, '..');
  if (!existsSync(dir)) {
    // Skip if directory doesn't exist
    return;
  }

  const content = JSON.stringify({ mcpServers: servers, version: '1.0' }, null, 2);
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Get config file path for a given scope
 */
export function getConfigPath(scope: ConfigScope): string {
  switch (scope) {
    case 'user':
      return DEFAULT_USER_CONFIG_PATH;
    case 'project':
    case 'local':
      return DEFAULT_PROJECT_CONFIG_PATH;
    default:
      return DEFAULT_USER_CONFIG_PATH;
  }
}

// ============================================================================
// MCP Serve Command
// ============================================================================

/**
 * Serve command - Start an MCP server
 */
export async function serveCommand(options: ServeOptions): Promise<void> {
  const { name, command, args, env, configPath, scope = 'project', verbose } = options;

  // Load existing configs
  const configFilePath = configPath || getConfigPath(scope);
  const servers = loadMCPConfig(configFilePath);

  if (!servers[name] && !command) {
    console.error(`Server "${name}" not found in config. Add it first or provide --command.`);
    process.exit(1);
  }

  // Create server config
  const serverConfig: MCPServerConfig = servers[name] || {
    type: 'stdio',
    command: command!,
    args: args || [],
    env,
    autoConnect: true,
  };

  // Update config with new server
  servers[name] = serverConfig;
  saveMCPConfig(servers, configFilePath);

  // Create client manager (convert to legacy format)
  const manager = new MCPClientManager({ servers: toLegacyServerConfigs(servers) });

  if (verbose) {
    console.log(`Starting MCP server: ${name}`);
    console.log(`Config: ${JSON.stringify(serverConfig, null, 2)}`);
  }

  // Connect to server (convert to legacy format)
  try {
    await manager.connect(toLegacyServerConfigs({ [name]: serverConfig })[0]);

    if (verbose) {
      console.log(`Server "${name}" started successfully`);
    }

    // Keep process alive
    await new Promise(() => {});
  } catch (error) {
    console.error(`Failed to start server "${name}":`, error);
    process.exit(1);
  }
}

// ============================================================================
// MCP List Command
// ============================================================================

/**
 * List command - List all configured MCP servers
 */
export async function listCommand(options: MCPCommandOptions): Promise<void> {
  const { configPath, scope = 'project' } = options;

  const configFilePath = configPath || getConfigPath(scope);
  const servers = loadMCPConfig(configFilePath);

  if (Object.keys(servers).length === 0) {
    console.log('No MCP servers configured.');
    console.log(`Run 'upup mcp add <name> --command <cmd>' to add one.`);
    return;
  }

  console.log('Configured MCP servers:');
  console.log('');

  for (const [name, config] of Object.entries(servers)) {
    const type = config.type || 'stdio';
    let endpoint = '';

    if ('url' in config) {
      endpoint = config.url;
    } else if ('command' in config) {
      endpoint = config.command;
    }

    console.log(`  ${name}`);
    console.log(`    type: ${type}`);
    if (endpoint) {
      console.log(`    endpoint: ${endpoint}`);
    }
    console.log('');
  }
}

// ============================================================================
// MCP Status Command
// ============================================================================

/**
 * Status command - Show server connection status
 */
export async function statusCommand(options: MCPCommandOptions): Promise<void> {
  const { configPath, scope = 'project' } = options;

  const configFilePath = configPath || getConfigPath(scope);
  const servers = loadMCPConfig(configFilePath);

  if (Object.keys(servers).length === 0) {
    console.log('No MCP servers configured.');
    return;
  }

  const manager = new MCPClientManager({ servers: toLegacyServerConfigs(servers) });

  console.log('MCP Server Status:');
  console.log('');

  for (const [name] of Object.entries(servers)) {
    const status = manager.getConnectionState(name);

    if (status) {
      const state = status.state;
      const stateIcon = state === 'connected' ? '✓' : state === 'error' ? '✗' : '○';
      console.log(`  ${stateIcon} ${name} - ${state}`);

      if (status.error) {
        console.log(`    Error: ${status.error}`);
      }
    } else {
      console.log(`  ○ ${name} - disconnected`);
    }
  }
}

// ============================================================================
// MCP Add Command
// ============================================================================

export interface AddOptions extends MCPCommandOptions {
  name: string;
  type: 'stdio' | 'sse' | 'http' | 'ws';
  command?: string;
  url?: string;
  args?: string[];
  env?: string[];
}

export interface RemoveOptions extends MCPCommandOptions {
  name: string;
}

/**
 * Add command - Add a new server configuration
 */
export async function addCommand(options: AddOptions): Promise<void> {
  const {
    name,
    type,
    command,
    url,
    args = [],
    env = [],
    configPath,
    scope = 'project',
  } = options;

  if (!command && !url) {
    console.error('Either --command or --url is required.');
    process.exit(1);
  }

  // Build server config
  let serverConfig: MCPServerConfig;

  if (type === 'stdio') {
    serverConfig = McpStdioServerConfigSchema.parse({
      type: 'stdio',
      command,
      args,
      env: env.length > 0 ? Object.fromEntries(env.map(e => e.split('='))) : undefined,
    });
  } else {
    serverConfig = McpSSEServerConfigSchema.parse({
      type,
      url: url || command, // url is required for non-stdio
    });
  }

  // Load and update config
  const configFilePath = configPath || getConfigPath(scope);
  const servers = loadMCPConfig(configFilePath);

  servers[name] = serverConfig;
  saveMCPConfig(servers, configFilePath);

  console.log(`Added MCP server "${name}" to ${configFilePath}`);
  console.log(`Run 'upup mcp serve ${name}' to start it.`);
}

// ============================================================================
// MCP Remove Command
// ============================================================================

/**
 * Remove command - Remove a server configuration
 */
export async function removeCommand(options: RemoveOptions): Promise<void> {
  const { name, configPath, scope = 'project' } = options;

  const configFilePath = configPath || getConfigPath(scope);
  const servers = loadMCPConfig(configFilePath);

  if (!servers[name]) {
    console.error(`Server "${name}" not found in config.`);
    process.exit(1);
  }

  delete servers[name];
  saveMCPConfig(servers, configFilePath);

  console.log(`Removed MCP server "${name}" from ${configFilePath}`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export type MCPCommand = 'serve' | 'list' | 'status' | 'add' | 'remove';

/**
 * Main CLI handler for MCP commands
 */
export async function runMCPCommand(
  command: MCPCommand,
  args: string[],
  options: MCPCommandOptions
): Promise<void> {
  switch (command) {
    case 'serve':
      await serveCommand({
        ...options,
        name: args[0] || '',
      });
      break;

    case 'list':
      await listCommand(options);
      break;

    case 'status':
      await statusCommand(options);
      break;

    case 'add':
      await addCommand({
        ...options,
        name: args[0] || '',
        type: (options as any).type || 'stdio',
      });
      break;

    case 'remove':
      await removeCommand({
        ...options,
        name: args[0] || '',
      });
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Usage: upup mcp <serve|list|status|add|remove> [options]');
      process.exit(1);
  }
}