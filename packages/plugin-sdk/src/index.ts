/**
 * @upup/plugin-sdk - UpUp Plugin SDK
 *
 * This is the public interface for external plugin development.
 * Import this package to create plugins for UpUp.
 *
 * @example
 * ```typescript
 * import type { PluginAPI } from '@upup/plugin-sdk';
 *
 * export default function myPlugin(api: PluginAPI) {
 *   api.registerTool({
 *     name: 'my_tool',
 *     description: 'My custom tool',
 *     inputSchema: { type: 'object', properties: {} },
 *     handler: async (args) => ({ result: 'done' })
 *   });
 * }
 * ```
 */

// Re-export types from @upup/types
export type {
  AgentTool,
  ToolOptions,
  HookContext,
  HookResult,
  ProviderConfig,
  LlmOptions,
  LlmResponse,
  Session,
  SessionConfig,
  Message,
  MemoryEntry,
  SearchResult,
  SearchOptions,
  UpupError,
  PluginError,
  ToolError,
  ProviderError,
} from '@upup/types';

import type {
  HookContext,
  HookResult,
  ProviderConfig,
  ToolOptions,
} from '@upup/types';
import type { PluginSkillRegistration } from './manifest.js';

// ===== Plugin API =====

/**
 * Main Plugin API interface
 * This is passed to plugins during initialization
 */
export interface PluginAPI {
  /** Plugin identifier */
  id: string;

  /** Plugin metadata */
  meta: PluginMeta;

  /** Logger instance */
  logger: PluginLogger;

  /** Register a tool */
  registerTool(tool: ExternalTool, options?: ToolOptions): void;

  /**
   * Register a skill (P1.7 — added in unify-skills-and-plugins-registries).
   * The skill becomes available in /cmd autocomplete, the local
   * SkillCommandRegistry, and the system prompt. Returns a cleanup
   * function that unregisters the skill.
   */
  registerSkill(skill: PluginSkillRegistration): () => void;

  /** Register hooks */
  registerHook(events: string | string[], handler: HookHandler): void;

  /** Register MCP channel */
  registerChannel(config: ChannelConfig): void;

  /** Register CLI commands */
  registerCli(commands: CliCommand[]): void;

  /** Register LLM provider */
  registerProvider(config: ProviderConfig): void;

  /** Get plugin configuration */
  getConfig(): Record<string, unknown>;

  /** Listen to lifecycle events */
  on<K extends PluginLifecycleEvent>(
    event: K,
    handler: PluginLifecycleHandler[K]
  ): void;

  /** Mark plugin as ready */
  ready(): void;
}

// ===== Metadata =====

export interface PluginMeta {
  name: string;
  version?: string;
  description?: string;
}

// ===== Logger =====

/**
 * Logger interface for plugins
 */
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: Error): void;
  debug?(message: string): void;
}

// ===== Tool =====

/**
 * External tool definition (used by plugins)
 */
export interface ExternalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// ===== Hook =====

/**
 * Hook handler function type
 */
export type HookHandler = (
  context: HookContext
) => Promise<HookResult | void>;

// ===== Channel =====

/**
 * MCP channel configuration
 */
export interface ChannelConfig {
  id: string;
  type: 'stdio' | 'http' | 'websocket';
  config?: Record<string, unknown>;
}

// ===== CLI =====

/**
 * CLI command definition
 */
export interface CliCommand {
  name: string;
  description?: string;
  handler: (args: string[]) => Promise<void>;
}

// ===== Lifecycle =====

/**
 * Plugin lifecycle events
 */
export type PluginLifecycleEvent =
  | 'install'
  | 'activate'
  | 'deactivate'
  | 'update';

/**
 * Plugin lifecycle handlers
 */
export type PluginLifecycleHandler = {
  install: () => Promise<void>;
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  update: (oldVersion: string) => Promise<void>;
};

// ===== Config Schema =====

/**
 * Plugin manifest configuration schema field
 */
export interface ConfigSchemaField {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: unknown[];
}

/**
 * Tool result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ===== Manifest =====

export {
  type PluginManifest,
  type PluginManifestLoadResult,
  type PluginSkillEntry,
  type PluginSkillRegistration,
} from './manifest.js';
export { validateManifest, loadManifest } from './manifest.js';
