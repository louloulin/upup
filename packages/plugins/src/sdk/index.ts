/**
 * Plugin SDK - Internal Re-export
 *
 * Re-exports the public Plugin SDK interface from @upup/plugin-sdk
 * and extends it with internal UpUp-specific functionality.
 *
 * External plugins should use @upup/plugin-sdk directly.
 * Internal code should import from this module.
 */

// Re-export everything from @upup/plugin-sdk
export type {
  PluginAPI,
  PluginMeta,
  PluginLogger,
  ExternalTool,
  HookHandler,
  HookContext,
  HookResult,
  ChannelConfig,
  CliCommand,
  ProviderConfig,
  PluginLifecycleEvent,
  PluginLifecycleHandler,
} from '@upup/plugin-sdk';

export { validateManifest, loadManifest } from '@upup/plugin-sdk';

// Re-export types from @upup/types
export type {
  AgentTool,
  ToolOptions,
  HookConfig,
  ProviderConfig as LlmProviderConfig,
  SessionConfig,
  Message,
  MemoryEntry,
  SearchResult,
  SearchOptions,
  UpupError,
  PluginError as UpupPluginError,
  ToolError,
  ProviderError as UpupProviderError,
} from '@upup/types';
