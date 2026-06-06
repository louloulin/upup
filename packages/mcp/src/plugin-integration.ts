/**
 * MCP Plugin Integration
 *
 * Implements MCP server loading from plugins:
 * - Load MCP servers from plugin manifest (.mcp.json)
 * - Extract MCP servers from .mcpb files
 * - Resolve environment variables (CLAUDE_PLUGIN_ROOT, etc.)
 * - Handle user configuration for MCP servers
 *
 * Reference: Claude Code's src/utils/plugins/mcpPluginIntegration.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  /** Server command (e.g., 'npx', 'uvx') */
  command: string;
  /** Server arguments */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Server name (may be prefixed) */
  name?: string;
  /** Source plugin name */
  scope?: string;
  /** User-configured flag */
  userConfigured?: boolean;
}

/**
 * Plugin MCP manifest
 */
export interface PluginMcpManifest {
  /** Plugin name */
  name: string;
  /** Plugin root directory */
  root: string;
  /** MCP servers defined in plugin */
  servers: Record<string, Omit<McpServerConfig, 'scope'>>;
}

/**
 * MCPB file info
 */
export interface McpbFileInfo {
  /** File path */
  path: string;
  /** Plugin name extracted from filename */
  pluginName: string;
  /** User config section name */
  channel: string;
  /** Whether requires user configuration */
  requiresUserConfig: boolean;
}

/**
 * Plugin MCP environment
 */
export interface PluginMcpEnv {
  /** Plugin root directory path */
  pluginRoot: string;
  /** Plugin name */
  pluginName: string;
  /** Additional env vars from user config */
  userConfig: Record<string, string>;
}

// ============================================================================
// Constants
// ============================================================================

const MCPB_EXTENSIONS = ['.mcpb', '.dxt'];
const MCP_JSON_FILE = '.mcp.json';

// ============================================================================
// MCPB File Handler
// ============================================================================

/**
 * Check if a source is a MCPB file
 */
export function isMcpbSource(source: string): boolean {
  const lower = source.toLowerCase();
  return MCPB_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Extract plugin name from MCPB filename
 */
export function extractPluginNameFromMcpb(filename: string): string {
  // Format: plugin-name-X.Y.Z.mcpb or plugin-name.mcpb
  const basename = filename.replace(/\.(mcpb|dxt)$/i, '');

  // Remove version suffix if present (X.Y.Z format)
  const versionPattern = /-\d+\.\d+\.\d+$/;
  return basename.replace(versionPattern, '');
}

/**
 * Parse MCPB file info
 */
export function parseMcpbFile(filePath: string): McpbFileInfo | null {
  const filename = filePath.split('/').pop() || '';
  if (!isMcpbSource(filename)) {
    return null;
  }

  const pluginName = extractPluginNameFromMcpb(filename);
  const channel = `mcpb:${pluginName}`;

  return {
    path: filePath,
    pluginName,
    channel,
    requiresUserConfig: true,
  };
}

// ============================================================================
// Environment Variable Resolution
// ============================================================================

/**
 * Resolve environment variables in a string
 * Supports: ${VAR}, ${VAR:-default}, ${CLAUDE_PLUGIN_ROOT}
 */
export function resolveEnvVars(
  input: string,
  env: Record<string, string>
): string {
  return input.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    const [varName, defaultValue] = expr.split(':-');
    const value = env[varName.trim()];

    if (value !== undefined) {
      return value;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // Return original if no match
    return match;
  });
}

/**
 * Resolve environment variables in MCP server config
 */
export function resolveMcpServerEnv(
  config: McpServerConfig,
  pluginEnv: PluginMcpEnv
): McpServerConfig {
  const env: Record<string, string> = {
    ...process.env,
    ...config.env,
    CLAUDE_PLUGIN_ROOT: pluginEnv.pluginRoot,
    ...pluginEnv.userConfig,
  };

  const resolved: McpServerConfig = {
    command: resolveEnvVars(config.command, env),
    args: config.args.map(arg => resolveEnvVars(arg, env)),
    env: config.env,
    name: config.name,
    scope: config.scope,
  };

  return resolved;
}

// ============================================================================
// Plugin MCP Integration
// ============================================================================

/**
 * Load MCP servers from plugin directory
 */
export async function loadPluginMcpServers(
  pluginRoot: string,
  pluginName: string
): Promise<Record<string, McpServerConfig>> {
  const servers: Record<string, McpServerConfig> = {};
  const fs = await import('fs');
  const path = await import('path');

  // Check for .mcp.json
  const mcpJsonPath = path.join(pluginRoot, MCP_JSON_FILE);

  if (fs.existsSync(mcpJsonPath)) {
    try {
      const content = fs.readFileSync(mcpJsonPath, 'utf-8');
      const manifest = JSON.parse(content) as Record<string, Omit<McpServerConfig, 'scope'>>;

      for (const [name, config] of Object.entries(manifest)) {
        servers[name] = {
          ...config,
          scope: pluginName,
        };
      }
    } catch (error) {
      console.error(`Failed to load ${mcpJsonPath}:`, error);
    }
  }

  // Check for .mcpb files
  const mcpbFiles = findMcpbFiles(pluginRoot);

  for (const mcpbFile of mcpbFiles) {
    const info = parseMcpbFile(mcpbFile);
    if (info) {
      // Note: .mcpb loading would require downloading/extracting
      // For now, just add a placeholder
      servers[`mcpb:${info.pluginName}`] = {
        command: 'echo',
        args: [`MCPB file: ${mcpbFile}`],
        scope: pluginName,
        userConfigured: info.requiresUserConfig,
      };
    }
  }

  return servers;
}

/**
 * Find all .mcpb files in a directory
 */
function findMcpbFiles(dir: string): string[] {
  const files: string[] = [];
  const fs = require('fs');
  const path = require('path');

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findMcpbFiles(fullPath));
    } else if (isMcpbSource(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Add plugin scope prefix to server names
 * Avoids naming conflicts between plugins
 */
export function addPluginScopeToServers(
  servers: Record<string, McpServerConfig>,
  pluginName: string
): Record<string, McpServerConfig> {
  const scoped: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(servers)) {
    const scopedName = `plugin:${pluginName}:${name}`;
    scoped[scopedName] = {
      ...config,
      name: scopedName,
      scope: pluginName,
    };
  }

  return scoped;
}

// ============================================================================
// MCP Plugin Manager
// ============================================================================

/**
 * MCP Plugin Manager
 */
export class McpPluginManager {
  private plugins: Map<string, PluginMcpManifest> = new Map();
  private servers: Map<string, McpServerConfig> = new Map();
  private userConfigs: Map<string, Record<string, string>> = new Map();

  /**
   * Register a plugin
   */
  registerPlugin(manifest: PluginMcpManifest): void {
    this.plugins.set(manifest.name, manifest);
  }

  /**
   * Get plugin manifest
   */
  getPlugin(name: string): PluginMcpManifest | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): PluginMcpManifest[] {
    return [...this.plugins.values()];
  }

  /**
   * Load MCP servers from all registered plugins
   */
  async loadAllServers(): Promise<void> {
    this.servers.clear();

    for (const [name, manifest] of this.plugins) {
      const servers = await loadPluginMcpServers(manifest.root, name);
      const scoped = addPluginScopeToServers(servers, name);

      for (const [serverName, config] of Object.entries(scoped)) {
        this.servers.set(serverName, config);
      }
    }
  }

  /**
   * Get MCP server config
   */
  getServer(name: string): McpServerConfig | undefined {
    return this.servers.get(name);
  }

  /**
   * Get all MCP servers
   */
  getAllServers(): Map<string, McpServerConfig> {
    return new Map(this.servers);
  }

  /**
   * Get servers by plugin
   */
  getServersByPlugin(pluginName: string): Map<string, McpServerConfig> {
    const result = new Map<string, McpServerConfig>();

    for (const [name, config] of this.servers) {
      if (config.scope === pluginName) {
        result.set(name, config);
      }
    }

    return result;
  }

  /**
   * Set user configuration for a plugin
   */
  setUserConfig(pluginName: string, config: Record<string, string>): void {
    this.userConfigs.set(pluginName, config);
  }

  /**
   * Get user configuration for a plugin
   */
  getUserConfig(pluginName: string): Record<string, string> | undefined {
    return this.userConfigs.get(pluginName);
  }

  /**
   * Get unconfigured channels (servers requiring user config)
   */
  getUnconfiguredChannels(): string[] {
    const unconfigured: string[] = [];

    for (const [name, config] of this.servers) {
      if (config.userConfigured && !this.userConfigs.has(config.scope || '')) {
        unconfigured.push(name);
      }
    }

    return unconfigured;
  }

  /**
   * Remove plugin and its servers
   */
  removePlugin(pluginName: string): void {
    this.plugins.delete(pluginName);
    this.userConfigs.delete(pluginName);

    // Remove associated servers
    for (const name of [...this.servers.keys()]) {
      const config = this.servers.get(name);
      if (config?.scope === pluginName) {
        this.servers.delete(name);
      }
    }
  }

  /**
   * Clear all plugins and servers
   */
  clear(): void {
    this.plugins.clear();
    this.servers.clear();
    this.userConfigs.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    pluginCount: number;
    serverCount: number;
    configuredCount: number;
    unconfiguredCount: number;
  } {
    const configured = this.userConfigs.size;
    const unconfigured = this.getUnconfiguredChannels().length;

    return {
      pluginCount: this.plugins.size,
      serverCount: this.servers.size,
      configuredCount: configured,
      unconfiguredCount: unconfigured,
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalManager: McpPluginManager | null = null;

export function getMcpPluginManager(): McpPluginManager {
  if (!globalManager) {
    globalManager = new McpPluginManager();
  }
  return globalManager;
}

export function resetMcpPluginManager(): void {
  if (globalManager) {
    globalManager.clear();
    globalManager = null;
  }
}

// ============================================================================
// Config File Operations
// ============================================================================

/**
 * Load MCP server user config from file
 */
export async function loadMcpServerUserConfig(
  filePath: string
): Promise<Record<string, Record<string, string>>> {
  const fs = await import('fs');

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save MCP server user config to file
 */
export async function saveMcpServerUserConfig(
  filePath: string,
  config: Record<string, Record<string, string>>
): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}
