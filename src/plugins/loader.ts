/**
 * UpUp Plugin System — Plugin Loader
 *
 * Loads plugins using the appropriate runtime adapter.
 * Based on OpenClaw's loader.ts pattern with UpUp's unified adapter architecture.
 */

import { resolve, dirname } from 'path';
import { info, warn, error } from '../utils/logging/logger.js';
import { isPathInside, safeRealpathOrResolve, safeStatSync } from './path-safety.js';
import { loadPluginManifest, validatePluginConfig, getManifestLoader } from './manifest.js';
import { getServiceManager } from './services.js';
import type {
  PluginManifest,
  PluginRuntime,
  LoadedPlugin,
  UpUpPluginApi,
  PluginAdapter,
  DiscoveredPlugin,
  PluginSource,
  AgentTool,
  PluginService,
  HookHandler,
} from './types.js';
import type { PluginConfig } from './types.js';

// ============================================================================
// Plugin Source Directories
// ============================================================================

const SOURCE_DIRECTORIES: Record<PluginSource, string | null> = {
  bundled: null, // Bundled at build time
  global: '~/.upup/plugins',
  workspace: null, // Resolved from config
  npm: null, // npm resolution
};

// ============================================================================
// Plugin API Implementation
// ============================================================================

class UpUpPluginApiImpl implements UpUpPluginApi {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly runtime: PluginRuntime;
  readonly config: Record<string, unknown>;
  readonly pluginConfig: Record<string, unknown>;
  readonly logger: any;

  private tools: AgentTool[] = [];
  private hooks: Map<string, { handler: HookHandler; options?: any }[]> = new Map();
  private channels: any[] = [];
  private commands: any[] = [];
  private services: PluginService[] = [];
  private dataSources: any[] = [];
  private pluginRoot: string;

  constructor(params: {
    id: string;
    name: string;
    version: string;
    runtime: PluginRuntime;
    config: Record<string, unknown>;
    pluginConfig: Record<string, unknown>;
    logger: any;
    pluginRoot: string;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.version = params.version;
    this.runtime = params.runtime;
    this.config = params.config;
    this.pluginConfig = params.pluginConfig;
    this.logger = params.logger;
    this.pluginRoot = params.pluginRoot;
  }

  // === Tool Registration ===
  registerTool(tool: AgentTool, options?: any): void {
    if (!tool) return;
    this.tools.push(tool);
    info('default', `Registered tool: ${tool.name}`);
  }

  registerTools(tools: AgentTool[], options?: any): void {
    for (const tool of tools) {
      this.registerTool(tool, options);
    }
  }

  // === Hook Registration ===
  registerHook(events: string[], handler: HookHandler, options?: any): void {
    for (const event of events) {
      this.on(event, handler, options?.priority);
    }
  }

  on(event: string, handler: HookHandler, priority?: number): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push({ handler, options: { priority } });
    info('default', `Registered hook: ${event}`);
  }

  // === Channel Registration ===
  registerChannel(channel: any): void {
    this.channels.push(channel);
    info('default', `Registered channel: ${channel.name}`);
  }

  // === Command Registration ===
  registerCommand(command: any): void {
    this.commands.push(command);
    info('default', `Registered command: ${command.name}`);
  }

  // === Service Registration ===
  registerService(service: PluginService): void {
    this.services.push(service);
    getServiceManager().register(this.id, service);
    info('default', `Registered service: ${service.name}`);
  }

  // === Data Source Registration ===
  registerDataSource(source: any): void {
    this.dataSources.push(source);
    info('default', `Registered data source: ${source.name}`);
  }

  // === Utilities ===
  resolvePath(relativePath: string): string {
    const resolved = resolve(this.pluginRoot, relativePath);
    if (!isPathInside(resolved, this.pluginRoot)) {
      throw new Error(`Path resolution would escape plugin boundary: ${relativePath}`);
    }
    return resolved;
  }

  // === Internal access ===
  getTools(): AgentTool[] {
    return this.tools;
  }

  getHooks(): Map<string, { handler: HookHandler; options?: any }[]> {
    return this.hooks;
  }

  getServices(): PluginService[] {
    return this.services;
  }
}

// ============================================================================
// Plugin Loader
// ============================================================================

export class PluginLoader {
  private adapters: Map<PluginRuntime, PluginAdapter> = new Map();
  private loaded: Map<string, LoadedPlugin> = new Map();
  private apiCache: Map<string, UpUpPluginApiImpl> = new Map();

  constructor() {
    // Adapters will be registered via registerAdapter()
  }

  /**
   * Register a runtime adapter
   */
  registerAdapter(adapter: PluginAdapter): void {
    this.adapters.set(adapter.runtime, adapter);
  }

  /**
   * Load a plugin from a manifest
   */
  async load(manifest: PluginManifest, config: Record<string, unknown>, cwd: string): Promise<LoadedPlugin> {
    const adapter = this.adapters.get(manifest.runtime);
    if (!adapter) {
      throw new Error(`No adapter registered for runtime: ${manifest.runtime}`);
    }

    // Create plugin API
    const api = new UpUpPluginApiImpl({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      runtime: manifest.runtime,
      config,
      pluginConfig: config,
      logger: {
        info: (msg: string) => info('default', `[${manifest.name}] ${msg}`),
        warn: (msg: string) => warn('default', `[${manifest.name}] ${msg}`),
        error: (msg: string) => error('default', `[${manifest.name}] ${msg}`),
      },
      pluginRoot: cwd,
    });

    // Cache the API
    this.apiCache.set(manifest.id, api);

    // Validate config
    if (!validatePluginConfig(manifest, config)) {
      throw new Error(`Invalid plugin config for: ${manifest.id}`);
    }

    // Load via adapter
    const plugin = await adapter.load(manifest, api);

    // Track loaded
    this.loaded.set(manifest.id, plugin);

    return plugin;
  }

  /**
   * Unload a plugin
   */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.loaded.get(pluginId);
    if (!plugin) {
      warn('default', `Plugin not loaded: ${pluginId}`);
      return;
    }

    const adapter = this.adapters.get(plugin.runtime);
    if (adapter) {
      await adapter.unload(plugin);
    }

    // Stop services
    const serviceManager = getServiceManager();
    await serviceManager.stopServices(pluginId);

    this.loaded.delete(pluginId);
    this.apiCache.delete(pluginId);
  }

  /**
   * Unload all plugins
   */
  async unloadAll(): Promise<void> {
    const pluginIds = [...this.loaded.keys()];
    for (const pluginId of pluginIds) {
      await this.unload(pluginId);
    }
  }

  /**
   * Get a loaded plugin by ID
   */
  get(pluginId: string): LoadedPlugin | undefined {
    return this.loaded.get(pluginId);
  }

  /**
   * Get all loaded plugins
   */
  getAll(): LoadedPlugin[] {
    return [...this.loaded.values()];
  }

  /**
   * Get plugin API by ID
   */
  getApi(pluginId: string): UpUpPluginApiImpl | undefined {
    return this.apiCache.get(pluginId);
  }
}

// ============================================================================
// Plugin Loader Singleton
// ============================================================================

let pluginLoader: PluginLoader | null = null;

export function getPluginLoader(): PluginLoader {
  if (!pluginLoader) {
    pluginLoader = new PluginLoader();
  }
  return pluginLoader;
}

export function resetPluginLoader(): void {
  if (pluginLoader) {
    pluginLoader.unloadAll();
  }
  pluginLoader = null;
}

// ============================================================================
// Plugin Discovery
// ============================================================================

export interface DiscoveryOptions {
  sources?: PluginSource[];
  workspaceDir?: string;
}

/**
 * Discover plugins from configured sources
 */
export async function discoverPlugins(options: DiscoveryOptions = {}): Promise<DiscoveredPlugin[]> {
  const plugins: DiscoveredPlugin[] = [];
  const sources = options.sources ?? ['bundled', 'global', 'workspace', 'npm'];

  for (const source of sources) {
    try {
      const discovered = await discoverFromSource(source, options.workspaceDir);
      plugins.push(...discovered);
    } catch (err) {
      warn('default', `Failed to discover plugins from ${source}: ${(err as Error).message}`);
    }
  }

  return plugins;
}

/**
 * Discover plugins from a specific source
 */
async function discoverFromSource(source: PluginSource, workspaceDir?: string): Promise<DiscoveredPlugin[]> {
  const plugins: DiscoveredPlugin[] = [];

  switch (source) {
    case 'bundled':
      // Bundled plugins are loaded at build time
      await discoverBundled(plugins);
      break;

    case 'global':
      // Global plugins: ~/.upup/plugins
      await discoverFromDirectory(expandPath('~/.upup/plugins'), 'global', plugins);
      break;

    case 'workspace':
      // Workspace plugins from project config
      if (workspaceDir) {
        await discoverFromDirectory(workspaceDir + '/.upup/plugins', 'workspace', plugins);
      }
      break;

    case 'npm':
      // npm installed plugins
      // Resolved via package.json dependencies
      break;
  }

  return plugins;
}

/**
 * Discover bundled plugins
 */
async function discoverBundled(plugins: DiscoveredPlugin[]): Promise<void> {
  // Bundled plugins are registered at build time
  // This would be filled in by the build system
}

/**
 * Discover plugins in a directory
 */
async function discoverFromDirectory(
  dirPath: string,
  source: PluginSource,
  plugins: DiscoveredPlugin[]
): Promise<void> {
  const { existsSync, readdirSync } = require('fs');

  if (!existsSync(dirPath)) {
    return;
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const manifestPath = resolve(dirPath, entry.name, 'upup.plugin.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = loadPluginManifest(dirname(manifestPath));
        plugins.push({
          source,
          path: dirname(manifestPath),
          manifest,
        });
      } catch (err) {
        warn('default', `Invalid manifest in ${entry.name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    warn('default', `Cannot read directory ${dirPath}: ${(err as Error).message}`);
  }
}

/**
 * Expand ~ in paths
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    return resolve(home, path.slice(2));
  }
  return resolve(path);
}

// ============================================================================
// Plugin Lifecycle Management
// ============================================================================

export interface PluginLifecycleOptions {
  manifest: PluginManifest;
  config: Record<string, unknown>;
  cwd: string;
  stateDir?: string;
}

/**
 * Load and start a plugin with full lifecycle
 */
export async function loadAndStartPlugin(options: PluginLifecycleOptions): Promise<LoadedPlugin> {
  const { manifest, config, cwd, stateDir = cwd + '/.upup-state' } = options;

  const loader = getPluginLoader();
  const plugin = await loader.load(manifest, config, cwd);

  // Start services
  const serviceManager = getServiceManager();
  await serviceManager.startServices(manifest.id, manifest.name, config, cwd, stateDir);

  return plugin;
}

/**
 * Stop and unload a plugin
 */
export async function stopAndUnloadPlugin(pluginId: string): Promise<void> {
  const loader = getPluginLoader();
  await loader.unload(pluginId);
}