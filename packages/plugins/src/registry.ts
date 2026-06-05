/**
 * UpUp Plugin System — Plugin Registry
 *
 * Central registry for plugin capabilities.
 * Follows OpenClaw's capability registration pattern.
 */

import { info, warn } from '@upup/utils/logging';
import type {
  PluginRegistry,
  LoadedPlugin,
  PluginCapability,
  AgentTool,
  PluginService,
  HookHandler,
} from './types.js';
import { PluginError } from './types.js';

/**
 * Plugin Registry Implementation
 */
export class PluginRegistryImpl implements PluginRegistry {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private tools: AgentTool[] = [];
  private services: PluginService[] = [];
  private hooks: Map<string, HookHandler[]> = new Map();
  private capabilities: Map<PluginCapability, LoadedPlugin[]> = new Map();
  private errors: Map<string, PluginError> = new Map();

  /**
   * Register a loaded plugin
   */
  register(plugin: LoadedPlugin): void {
    if (this.plugins.has(plugin.id)) {
      warn('default', `Plugin already registered: ${plugin.id}`);
      return;
    }

    info('default', `Registering plugin: ${plugin.id} (${plugin.runtime})`);

    // Store plugin
    this.plugins.set(plugin.id, plugin);

    // Register tools
    for (const tool of plugin.tools) {
      this.tools.push(tool);
    }

    // Register services
    for (const service of plugin.services) {
      this.services.push(service);
    }

    // Register hooks
    for (const [event, handlers] of plugin.hooks) {
      if (!this.hooks.has(event)) {
        this.hooks.set(event, []);
      }
      const existing = this.hooks.get(event)!;
      existing.push(...handlers);
    }

    // Track by capability
    for (const capability of plugin.manifest.capabilities) {
      if (!this.capabilities.has(capability)) {
        this.capabilities.set(capability, []);
      }
      this.capabilities.get(capability)!.push(plugin);
    }

    info('default', `Plugin registered: ${plugin.id} (${plugin.manifest.capabilities.join(', ')})`);
  }

  /**
   * Unregister a plugin
   */
  unregister(id: string): void {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      warn('default', `Plugin not found for unregister: ${id}`);
      return;
    }

    info('default', `Unregistering plugin: ${id}`);

    // Remove tools
    this.tools = this.tools.filter(t => !plugin.tools.includes(t));

    // Remove services
    this.services = this.services.filter(s => !plugin.services.includes(s));

    // Remove hooks
    for (const [event, handlers] of plugin.hooks) {
      const existing = this.hooks.get(event);
      if (existing) {
        const filtered = existing.filter(h => !handlers.includes(h));
        if (filtered.length === 0) {
          this.hooks.delete(event);
        } else {
          this.hooks.set(event, filtered);
        }
      }
    }

    // Remove from capabilities
    for (const capability of plugin.manifest.capabilities) {
      const list = this.capabilities.get(capability);
      if (list) {
        const filtered = list.filter(p => p.id !== id);
        if (filtered.length === 0) {
          this.capabilities.delete(capability);
        } else {
          this.capabilities.set(capability, filtered);
        }
      }
    }

    // Remove plugin
    this.plugins.delete(id);
  }

  /**
   * Get a plugin by ID
   */
  get(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get all plugins
   */
  getAll(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Get plugins by capability
   */
  getByCapability(capability: PluginCapability): LoadedPlugin[] {
    return this.capabilities.get(capability) ?? [];
  }

  /**
   * Get all registered tools
   */
  getTools(): AgentTool[] {
    return [...this.tools];
  }

  /**
   * Get all registered services
   */
  getServices(): PluginService[] {
    return [...this.services];
  }

  /**
   * Get hooks for an event
   */
  getHooks(event: string): HookHandler[] {
    return this.hooks.get(event) ?? [];
  }

  /**
   * Get services with plugin name for display
   */
  getEnrichedServices(): import('./types.js').EnrichedService[] {
    const result: import('./types.js').EnrichedService[] = [];
    for (const plugin of this.plugins.values()) {
      for (const service of plugin.services) {
        result.push({
          plugin: plugin.manifest.name,
          name: service.name,
        });
      }
    }
    return result;
  }

  /**
   * Get all hooks with plugin name for display
   */
  getAllEnrichedHooks(): import('./types.js').EnrichedHook[] {
    const result: import('./types.js').EnrichedHook[] = [];
    for (const plugin of this.plugins.values()) {
      for (const [event] of plugin.hooks) {
        result.push({
          plugin: plugin.manifest.name,
          name: event,
          event,
        });
      }
    }
    return result;
  }

  /**
   * Get tool names filtered by plugin name prefix
   */
  getToolNamesByPlugin(pluginName: string): string[] {
    const prefix = `${pluginName}:`;
    return this.tools
      .map(t => t?.name)
      .filter((name): name is string => name !== undefined && name.startsWith(prefix));
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.plugins.clear();
    this.tools = [];
    this.services = [];
    this.hooks.clear();
    this.capabilities.clear();
  }

  /**
   * Get plugin count
   */
  get size(): number {
    return this.plugins.size;
  }

  // ========================================================================
  // Phase 64: Enable/Disable Support
  // ========================================================================

  /**
   * Enable a plugin by ID
   */
  enable(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      warn('default', `Plugin not found for enable: ${id}`);
      return false;
    }

    plugin.enabled = true;
    // Clear any error when enabling
    this.errors.delete(id);
    info('default', `Plugin enabled: ${id}`);
    return true;
  }

  /**
   * Disable a plugin by ID
   */
  disable(id: string): boolean {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      warn('default', `Plugin not found for disable: ${id}`);
      return false;
    }

    plugin.enabled = false;
    info('default', `Plugin disabled: ${id}`);
    return true;
  }

  /**
   * Check if a plugin is enabled
   */
  isEnabled(id: string): boolean {
    const plugin = this.plugins.get(id);
    return plugin?.enabled ?? false;
  }

  /**
   * Get enabled plugins only
   */
  getEnabled(): LoadedPlugin[] {
    return [...this.plugins.values()].filter(p => p.enabled !== false);
  }

  /**
   * Get disabled plugins only
   */
  getDisabled(): LoadedPlugin[] {
    return [...this.plugins.values()].filter(p => p.enabled === false);
  }

  /**
   * Record a plugin error
   */
  setError(id: string, error: PluginError): void {
    this.errors.set(id, error);
    warn('default', `Plugin error recorded: ${id} - ${error.message}`);
  }

  /**
   * Get error for a plugin
   */
  getError(id: string): PluginError | undefined {
    return this.errors.get(id);
  }

  /**
   * Clear error for a plugin
   */
  clearError(id: string): void {
    this.errors.delete(id);
  }

  /**
   * Get all plugin errors
   */
  getAllErrors(): Array<{ id: string; error: PluginError }> {
    return [...this.errors.entries()].map(([id, error]) => ({ id, error }));
  }

  /**
   * Get plugins with errors
   */
  getPluginsWithErrors(): string[] {
    return [...this.errors.keys()];
  }
}

// ============================================================================
// Registry Singleton
// ============================================================================

let registry: PluginRegistryImpl | null = null;

export function getPluginRegistry(): PluginRegistryImpl {
  if (!registry) {
    registry = new PluginRegistryImpl();
  }
  return registry;
}

export function resetPluginRegistry(): void {
  if (registry) {
    registry.clear();
  }
  registry = null;
}