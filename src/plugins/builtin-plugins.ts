/**
 * Built-in Plugin Registry
 *
 * Provides programmatic registration of built-in plugins,
 * similar to Claude Code's builtinPlugins.ts.
 *
 * Built-in plugins are shipped with UpUp and can provide:
 * - Tools
 * - Skills
 * - MCP Servers
 * - Hooks
 * - Services
 */

import type {
  PluginManifest,
  PluginCapability,
  LoadedPlugin,
} from './types.js';
import type { BundledSkillDefinition } from '../skills/types.js';

/**
 * Built-in plugin definition
 *
 * Extends PluginManifest with additional properties for
 * built-in plugins including skills, hooks, and MCP servers.
 */
export interface BuiltinPluginDefinition {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Whether this plugin is enabled by default */
  defaultEnabled?: boolean;
  /** Function to check if plugin is available */
  isAvailable?: () => boolean | Promise<boolean>;
  /** Skills provided by this plugin */
  skills?: BundledSkillDefinition[];
  /** MCP servers provided by this plugin */
  mcpServers?: MCPServerConfig[];
  /** Hooks configuration */
  hooks?: HooksConfig;
  /** Initialize function */
  initialize?: () => Promise<void> | void;
  /** Cleanup function */
  cleanup?: () => Promise<void> | void;
}

/**
 * MCP server configuration for built-in plugins
 */
export interface MCPServerConfig {
  /** Server name */
  name: string;
  /** Server command */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Server URL (for HTTP transport) */
  url?: string;
  /** Auto-connect on startup */
  autoConnect?: boolean;
}

/**
 * Hooks configuration for built-in plugins
 */
export interface HooksConfig {
  /** Pre-tool hooks */
  preTool?: string[];
  /** Post-tool hooks */
  postTool?: string[];
  /** Session hooks */
  session?: string[];
  /** Compact hooks */
  compact?: string[];
}

/**
 * Internal storage for built-in plugins
 */
const builtinPlugins = new Map<string, BuiltinPluginDefinition>();

/**
 * User settings for plugin enable/disable
 */
const userPluginSettings = new Map<string, boolean>();

/**
 * Register a built-in plugin programmatically
 *
 * @param definition - Plugin definition
 * @throws Error if plugin with same name already registered
 */
export function registerBuiltinPlugin(definition: BuiltinPluginDefinition): void {
  const { name } = definition.manifest;

  if (builtinPlugins.has(name)) {
    console.warn(`Builtin plugin "${name}" is already registered. Overwriting.`);
  }

  builtinPlugins.set(name, definition);

  // Set default enabled state if not already set
  if (!userPluginSettings.has(name)) {
    userPluginSettings.set(name, definition.defaultEnabled ?? true);
  }
}

/**
 * Unregister a built-in plugin
 *
 * @param name - Plugin name
 */
export function unregisterBuiltinPlugin(name: string): void {
  builtinPlugins.delete(name);
  userPluginSettings.delete(name);
}

/**
 * Get a built-in plugin definition by name
 *
 * @param name - Plugin name
 * @returns Plugin definition or undefined
 */
export function getBuiltinPlugin(name: string): BuiltinPluginDefinition | undefined {
  return builtinPlugins.get(name);
}

/**
 * Get all registered built-in plugins
 *
 * @returns Array of plugin definitions
 */
export function getAllBuiltinPlugins(): BuiltinPluginDefinition[] {
  return Array.from(builtinPlugins.values());
}

/**
 * Get enabled built-in plugins
 *
 * @returns Array of enabled plugin definitions
 */
export function getEnabledBuiltinPlugins(): BuiltinPluginDefinition[] {
  return getAllBuiltinPlugins().filter((plugin) => {
    const name = plugin.manifest.name;
    return userPluginSettings.get(name) ?? plugin.defaultEnabled ?? true;
  });
}

/**
 * Get disabled built-in plugins
 *
 * @returns Array of disabled plugin definitions
 */
export function getDisabledBuiltinPlugins(): BuiltinPluginDefinition[] {
  return getAllBuiltinPlugins().filter((plugin) => {
    const name = plugin.manifest.name;
    return !(userPluginSettings.get(name) ?? plugin.defaultEnabled ?? true);
  });
}

/**
 * Enable a built-in plugin
 *
 * @param name - Plugin name
 * @param enabled - Enable state (default: true)
 */
export function setBuiltinPluginEnabled(name: string, enabled = true): void {
  if (!builtinPlugins.has(name)) {
    throw new Error(`Builtin plugin "${name}" not found`);
  }
  userPluginSettings.set(name, enabled);
}

/**
 * Check if a built-in plugin is enabled
 *
 * @param name - Plugin name
 * @returns Whether the plugin is enabled
 */
export function isBuiltinPluginEnabled(name: string): boolean {
  const plugin = builtinPlugins.get(name);
  if (!plugin) return false;
  return userPluginSettings.get(name) ?? plugin.defaultEnabled ?? true;
}

/**
 * Check if a built-in plugin is available
 *
 * Checks the isAvailable function if defined.
 *
 * @param name - Plugin name
 * @returns Whether the plugin is available
 */
export async function isBuiltinPluginAvailable(name: string): Promise<boolean> {
  const plugin = builtinPlugins.get(name);
  if (!plugin) return false;

  if (plugin.isAvailable) {
    return await Promise.resolve(plugin.isAvailable());
  }

  return true;
}

/**
 * Convert a built-in plugin to a LoadedPlugin
 *
 * @param definition - Built-in plugin definition
 * @returns Loaded plugin
 */
export function builtinToLoadedPlugin(definition: BuiltinPluginDefinition): LoadedPlugin {
  return {
    id: definition.manifest.id,
    manifest: definition.manifest,
    path: `builtin:${definition.manifest.name}`,
    enabled: isBuiltinPluginEnabled(definition.manifest.name),
  } as LoadedPlugin;
}

/**
 * Get all skills from enabled built-in plugins
 *
 * @returns Array of bundled skill definitions
 */
export function getBuiltinPluginSkills(): BundledSkillDefinition[] {
  const skills: BundledSkillDefinition[] = [];

  for (const plugin of getEnabledBuiltinPlugins()) {
    if (plugin.skills) {
      skills.push(...plugin.skills);
    }
  }

  return skills;
}

/**
 * Get all MCP servers from enabled built-in plugins
 *
 * @returns Array of MCP server configurations
 */
export function getBuiltinPluginMCPServers(): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];

  for (const plugin of getEnabledBuiltinPlugins()) {
    if (plugin.mcpServers) {
      servers.push(...plugin.mcpServers);
    }
  }

  return servers;
}

/**
 * Initialize all enabled built-in plugins
 *
 * Calls the initialize function for each enabled plugin.
 */
export async function initializeBuiltinPlugins(): Promise<void> {
  for (const plugin of getEnabledBuiltinPlugins()) {
    if (plugin.initialize) {
      try {
        await Promise.resolve(plugin.initialize());
      } catch (error) {
        console.error(
          `Failed to initialize built-in plugin "${plugin.manifest.name}":`,
          error
        );
      }
    }
  }
}

/**
 * Cleanup all built-in plugins
 *
 * Calls the cleanup function for each plugin.
 */
export async function cleanupBuiltinPlugins(): Promise<void> {
  for (const plugin of getAllBuiltinPlugins()) {
    if (plugin.cleanup) {
      try {
        await Promise.resolve(plugin.cleanup());
      } catch (error) {
        console.error(
          `Failed to cleanup built-in plugin "${plugin.manifest.name}":`,
          error
        );
      }
    }
  }
}

/**
 * Built-in plugin manager class
 *
 * Provides a class-based interface for managing built-in plugins.
 */
export class BuiltinPluginManager {
  /**
   * Register a built-in plugin
   */
  register(definition: BuiltinPluginDefinition): void {
    registerBuiltinPlugin(definition);
  }

  /**
   * Unregister a built-in plugin
   */
  unregister(name: string): void {
    unregisterBuiltinPlugin(name);
  }

  /**
   * Get a built-in plugin
   */
  get(name: string): BuiltinPluginDefinition | undefined {
    return getBuiltinPlugin(name);
  }

  /**
   * Get all built-in plugins
   */
  getAll(): BuiltinPluginDefinition[] {
    return getAllBuiltinPlugins();
  }

  /**
   * Get enabled plugins
   */
  getEnabled(): BuiltinPluginDefinition[] {
    return getEnabledBuiltinPlugins();
  }

  /**
   * Enable/disable a plugin
   */
  setEnabled(name: string, enabled: boolean): void {
    setBuiltinPluginEnabled(name, enabled);
  }

  /**
   * Check if plugin is enabled
   */
  isEnabled(name: string): boolean {
    return isBuiltinPluginEnabled(name);
  }

  /**
   * Initialize all enabled plugins
   */
  async initialize(): Promise<void> {
    await initializeBuiltinPlugins();
  }

  /**
   * Cleanup all plugins
   */
  async cleanup(): Promise<void> {
    await cleanupBuiltinPlugins();
  }

  /**
   * Get skills from enabled plugins
   */
  getSkills(): BundledSkillDefinition[] {
    return getBuiltinPluginSkills();
  }

  /**
   * Get MCP servers from enabled plugins
   */
  getMCPServers(): MCPServerConfig[] {
    return getBuiltinPluginMCPServers();
  }
}

// Default global manager instance
export const defaultBuiltinPluginManager = new BuiltinPluginManager();