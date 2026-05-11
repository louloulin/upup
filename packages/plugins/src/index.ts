/**
 * @upup/plugins - UpUp Plugin System
 *
 * Provides plugin types, manifest validation, and core plugin interfaces.
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
  ServiceContext,
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
} from './manifest.js';
