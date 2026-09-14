/**
 * @upup/plugins - UpUp Plugin System
 *
 * Provides plugin types, manifest validation, loader, registry, services, discovery,
 * path safety, and runtime adapters (bun, jiti, wasm, mcp, duckdb).
 */

// Plugin types
export type {
  PluginRuntime,
  PluginCapability,
  HookExecutionMode,
  SandboxLevel,
  PluginManifest,
  PluginAuthor,
  PluginSecurity,
  PluginConfig,
  UpUpPluginApi,
  AgentTool,
  ToolOptions,
  HookOptions,
  HookHandler,
  HookContext,
  HookResult,
  PluginService,
  DataSourcePlugin,
  DataSourceParams,
  ChannelPlugin,
  ChannelContext,
  ChannelMessage,
  PluginCommand,
  CommandContext,
  CommandResult,
  PluginAdapter,
  LoadedPlugin,
  PluginSource,
  DiscoveredPlugin,
} from './types.js';
export type { ServiceContext } from './services.js';

// Plugin errors
export {
  PluginError,
  PluginLoadError,
  PluginRuntimeError,
  PluginConfigError,
} from './types.js';

// Manifest loading & validation
export {
  ManifestLoader,
  getManifestLoader,
  loadPluginManifest,
  validatePluginConfig,
  validatePluginSkills,
} from './manifest.js';

// Plugin loader with adapter selection
export {
  PluginLoader,
  getPluginLoader,
  resetPluginLoader,
} from './loader.js';
export type { PluginLifecycleOptions } from './loader.js';

// Plugin registry (capability registration)
export {
  PluginRegistryImpl,
  getPluginRegistry,
  resetPluginRegistry,
} from './registry.js';

// Service lifecycle management
export {
  ServiceManager,
  getServiceManager,
  resetServiceManager,
} from './services.js';

// Plugin discovery
export {
  discoverPlugins,
  getGlobalPluginsDir,
  getWorkspacePluginsDir,
  filterEnabledPlugins,
  isSafePluginPath,
  derivePluginId,
} from './discovery.js';

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

// Hook events
export {
  HOOK_EVENTS,
  HOOK_EVENT_CATEGORIES,
  getHookRegistry,
  resetHookRegistry,
  type HookEvent,
} from './hook-events.js';
export type {
  BaseHookContext,
  ToolHookContext,
  SessionHookContext,
  MessageHookContext,
  FileHookContext,
  WorktreeHookContext,
  PermissionHookContext,
} from './hook-events.js';

// Builtin plugin definitions
export type {
  BuiltinPluginDefinition,
  MCPServerConfig as BuiltinMCPServerConfig,
  HooksConfig,
} from './builtin-plugins.js';
export {
  registerBuiltinPlugin,
  unregisterBuiltinPlugin,
  getBuiltinPlugin,
  getAllBuiltinPlugins,
  getEnabledBuiltinPlugins,
  getDisabledBuiltinPlugins,
  setBuiltinPluginEnabled,
  isBuiltinPluginEnabled,
} from './builtin-plugins.js';

// Plugin commands
export type { PluginCommandResult } from './commands.js';
export { pluginCommands } from './commands.js';

// Plugin locator
export {
  locator,
  initServices,
  registerSingleton,
  registerFactory,
  getService,
} from './locator.js';
export type { ServiceFactory } from './locator.js';

// Runtime adapters
export {
  registerAllAdapters,
  BunAdapter,
  JitiAdapter,
  WasmAdapter,
  McpAdapter,
} from './adapters/index.js';

// Data source plugins (DuckDB)
export {
  DuckDBPlugin,
  DuckDBAdapter,
  DuckDBService,
} from './data/duckdb-plugin.js';
export type { DuckDBConfig, QueryResult, TableInfo } from './data/duckdb-plugin.js';

// Re-export SDK for backwards compatibility (use @upup/plugin-sdk directly for new code)
export type {
  PluginAPI,
  PluginMeta,
  PluginLogger,
  ExternalTool,
  HookHandler as SdkHookHandler,
  HookContext as SdkHookContext,
  HookResult as SdkHookResult,
  ChannelConfig,
  CliCommand,
  ProviderConfig,
  PluginLifecycleEvent,
  PluginLifecycleHandler,
} from '@upup/plugin-sdk';
export { validateManifest, loadManifest } from '@upup/plugin-sdk';
