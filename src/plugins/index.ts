/**
 * UpUp Plugin System — Core Exports
 *
 * Main entry point for the plugin system.
 * Provides unified plugin loading across all runtimes.
 */

// Core types
export * from './types.js';

// Manifest loading & validation
export { ManifestLoader, getManifestLoader, loadPluginManifest, validatePluginConfig } from './manifest.js';

// Plugin loader with adapter selection
export { PluginLoader, getPluginLoader, resetPluginLoader } from './loader.js';
export type { PluginLifecycleOptions } from './loader.js';

// Plugin registry (capability registration)
export { PluginRegistryImpl, getPluginRegistry, resetPluginRegistry } from './registry.js';

// Service lifecycle management
export { ServiceManager, getServiceManager, resetServiceManager } from './services.js';
export type { ServiceContext } from './services.js';

// Path safety utilities
export {
  isPathInside,
  safeStatSync,
  safeRealpathOrResolve,
  openBoundaryFileSync,
  validatePluginDirectory,
  validatePluginEntry,
  resolvePluginPath,
  pluginFileExists,
} from './path-safety.js';

// Plugin discovery
export {
  discoverPlugins,
  getGlobalPluginsDir,
  getWorkspacePluginsDir,
  filterEnabledPlugins,
  isSafePluginPath,
  derivePluginId,
} from './discovery.js';

// Runtime adapters
export {
  registerAllAdapters,
  BunAdapter,
  JitiAdapter,
  WasmAdapter,
  McpAdapter,
} from './adapters/index.js';

// Re-export adapter types
export type { PluginAdapter } from './types.js';