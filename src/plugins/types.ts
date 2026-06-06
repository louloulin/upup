/**
 * UpUp Plugin System — Core Types
 *
 * Defines the unified plugin API that works across all runtimes:
 * bun (native ESM), jiti (TypeScript), wasm (Extism), mcp (external).
 *
 * Inspired by OpenClaw's plugin architecture with UpUp's investment focus.
 */

import type { ServiceContext } from './services.js';

// ============================================================================
// Plugin Runtime Types
// ============================================================================

/** Supported plugin runtimes */
export type PluginRuntime = 'bun' | 'jiti' | 'wasm' | 'mcp';

/** Plugin capability types */
export type PluginCapability =
  | 'data-source'
  | 'tools'
  | 'analysis'
  | 'strategy'
  | 'channel'
  | 'service'
  | 'skill'       // Plugin provides skills
  | 'hook';       // Plugin provides hooks

/** Hook execution modes */
export type HookExecutionMode = 'parallel' | 'sequential' | 'sync';

/** Security sandbox levels */
export type SandboxLevel = 'process' | 'wasm' | 'mcp' | 'none';

// ============================================================================
// Plugin Configuration
// ============================================================================

/**
 * Skill manifest entry for plugins (P1.7 — added in
 * unify-skills-and-plugins-registries). Plugins can declare skills in
 * their upup.plugin.json instead of forking the codebase. The shape is
 * a strict subset of SkillMetadata (no path/instructions required —
 * plugins register fully-formed Skills via the SDK at runtime).
 */
export interface PluginSkillEntry {
  /** Unique skill name (lowercase, hyphenated) */
  name: string;
  /** Short description shown in autocomplete + system prompt */
  description: string;
  /** Optional argument hint (e.g. "<ticker>") */
  argumentHint?: string;
  /** Optional slash command triggers (e.g. ["my", "ma"]) */
  aliases?: string[];
  /** Preferred model for this skill (sonnet | haiku | opus | default) */
  model?: 'sonnet' | 'haiku' | 'opus' | 'default';
  /** Whether this skill is user-invocable (default: true) */
  userInvocable?: boolean;
  /** Execution mode */
  context?: 'inline' | 'fork';
  /** Allowed tools */
  allowedTools?: string[];
  /** Markdown body — full instructions loaded into the skill */
  instructions: string;
}

export interface PluginManifest {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  description?: string;
  runtime: PluginRuntime;
  author?: PluginAuthor;
  license?: string;
  homepage?: string;
  capabilities: PluginCapability[];
  entry: string;
  hooks?: string;
  tools?: string;
  /** Skills declared in the manifest (registered on plugin load) */
  skills?: PluginSkillEntry[];
  dependencies?: string[];
  peerDependencies?: Record<string, string>;
  security?: PluginSecurity;
  runtimeConfig?: Record<string, unknown>;
}

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface PluginSecurity {
  sandbox: SandboxLevel;
  permissions?: string[];
}

export interface PluginConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  runtime: PluginRuntime;
  entry: string;
  capabilities: PluginCapability[];
  enabled: boolean;
  config: Record<string, unknown>;
}

// ============================================================================
// Plugin API (What plugins receive)
// ============================================================================

export interface UpUpPluginApi {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntime;
  config: Record<string, unknown>;
  pluginConfig: Record<string, unknown>;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  // === Tool Registration ===
  registerTool(tool: AgentTool, options?: ToolOptions): void;
  registerTools(tools: AgentTool[], options?: ToolOptions): void;

  // === Skill Registration (P1.7) ===
  /**
   * Register a skill at runtime. The skill becomes immediately available
   * in /cmd autocomplete, the local SkillCommandRegistry, and the system
   * prompt. Unregister via the returned cleanup function.
   */
  registerSkill(skill: {
    name: string;
    description: string;
    instructions: string;
    argumentHint?: string;
    aliases?: string[];
    model?: 'sonnet' | 'haiku' | 'opus' | 'default';
    context?: 'inline' | 'fork';
    allowedTools?: string[];
    userInvocable?: boolean;
  }): () => void;

  // === Hook Registration ===
  registerHook(events: string[], handler: HookHandler, options?: HookOptions): void;
  on(event: string, handler: HookHandler, priority?: number): void;

  // === Channel Registration ===
  registerChannel(channel: ChannelPlugin): void;

  // === Command Registration ===
  registerCommand(command: PluginCommand): void;

  // === Service Registration ===
  registerService(service: PluginService): void;

  // === Data Source Registration (investment focus) ===
  registerDataSource(source: DataSourcePlugin): void;

  // === Utilities ===
  resolvePath(relativePath: string): string;

  // === Lifecycle Hooks ===
  onLoad?(api: UpUpPluginApi): Promise<void> | void;
  onStart?(api: UpUpPluginApi): Promise<void> | void;
  onStop?(api: UpUpPluginApi): Promise<void> | void;
  onUnload?(api: UpUpPluginApi): Promise<void> | void;

  // === Internal Access (for adapters) ===
  _tools?: AgentTool[];
  _services?: PluginService[];
  _hooks?: Map<string, { handler: HookHandler; options?: any }[]>;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface AgentTool {
  name: string;
  description?: string;
  execute(args: Record<string, unknown>): Promise<unknown>;
  schema?: Record<string, unknown>;
}

export interface ToolOptions {
  optional?: boolean;
  category?: string;
  concurrencySafe?: boolean;
}

export interface HookOptions {
  priority?: number;
  mode?: HookExecutionMode;
  filter?: string[];
}

// ============================================================================
// Hook Types
// ============================================================================

export type HookHandler = (context: HookContext) => Promise<HookResult> | HookResult;

export interface HookContext {
  event: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

export type HookResult =
  | { allowed: boolean; data?: unknown; error?: string }
  | { modified?: boolean; data?: unknown }
  | void;

// Investment-specific hooks
export type InvestmentHook =
  // Data hooks
  | 'data_fetched'
  | 'data_source_error'
  | 'data_cached'
  // Analysis hooks
  | 'analysis_start'
  | 'analysis_complete'
  | 'analysis_render'
  // Portfolio hooks
  | 'portfolio_updated'
  | 'position_alert'
  | 'risk_threshold'
  // Service hooks
  | 'session_idle'
  | 'session_resume'
  | 'service_start'
  | 'service_stop';

// All hook names (existing + investment)
export type HookName =
  // Existing hooks (22 types from tool-hooks.ts)
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'ToolResultPersist'
  | 'BeforeMessageWrite'
  | 'MessageReceived'
  | 'MessageSending'
  | 'MessageSent'
  | 'BeforePromptBuild'
  | 'BeforeAgentStart'
  | 'AgentEnd'
  | 'LLMInput'
  | 'LLMOutput'
  | 'BeforeModelResolve'
  | 'SubagentSpawning'
  | 'SubagentDeliveryTarget'
  | 'SubagentSpawned'
  | 'SubagentEnded'
  | 'BeforeCompaction'
  | 'AfterCompaction'
  | 'BeforeReset'
  // Investment hooks
  | InvestmentHook;

// ============================================================================
// Service Types
// ============================================================================

export interface PluginService {
  name: string;
  start(ctx: ServiceContext): Promise<void>;
  stop?(ctx: ServiceContext): Promise<void>;
}

/** Enriched service info with plugin name for display */
export interface EnrichedService {
  plugin: string;
  name: string;
  description?: string;
}

/** Enriched hook info with plugin name for display */
export interface EnrichedHook {
  plugin: string;
  name: string;
  event?: string;
}

// ============================================================================
// Data Source Types (investment focus)
// ============================================================================

export interface DataSourcePlugin {
  id: string;
  name: string;
  provider: string;
  type: 'api' | 'file' | 'database';
  fetch<T>(params: DataSourceParams): Promise<T>;
  validateConfig?(config: Record<string, unknown>): boolean;
  healthCheck?(): Promise<boolean>;
}

export interface DataSourceParams {
  symbol?: string;
  startDate?: string;
  endDate?: string;
  interval?: string;
  [key: string]: unknown;
}

// ============================================================================
// Channel Types (messaging)
// ============================================================================

export interface ChannelPlugin {
  id: string;
  name: string;
  type: string;
  start(ctx: ChannelContext): Promise<void>;
  stop?(ctx: ChannelContext): Promise<void>;
  send?(message: ChannelMessage): Promise<void>;
}

export interface ChannelContext {
  accountId: string;
  config: Record<string, unknown>;
}

export interface ChannelMessage {
  to: string;
  body: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Command Types
// ============================================================================

export interface PluginCommand {
  name: string;
  description?: string;
  aliases?: string[];
  execute(args: string[], ctx: CommandContext): Promise<CommandResult>;
}

export interface CommandContext {
  sessionId: string;
  cwd: string;
}

export type CommandResult =
  | { type: 'output'; text: string }
  | { type: 'error'; message: string };

// ============================================================================
// Adapter Interface
// ============================================================================

export interface PluginAdapter {
  readonly runtime: PluginRuntime;
  canLoad(manifest: PluginManifest): boolean;
  load(manifest: PluginManifest, api: UpUpPluginApi): Promise<LoadedPlugin>;
  unload(plugin: LoadedPlugin): Promise<void>;
}

export interface LoadedPlugin {
  id: string;
  runtime: PluginRuntime;
  manifest: PluginManifest;
  instance: unknown;
  services: PluginService[];
  tools: AgentTool[];
  hooks: Map<string, HookHandler[]>;
  /** Optional file path to the plugin (for external plugins) */
  path?: string;
  /** Optional enabled state (defaults to true) */
  enabled?: boolean;
}

// ============================================================================
// Plugin Source (discovery)
// ============================================================================

export type PluginSource = 'bundled' | 'global' | 'workspace' | 'npm';

export interface DiscoveredPlugin {
  source: PluginSource;
  path: string;
  manifest: PluginManifest;
}

// ============================================================================
// Plugin Registry
// ============================================================================

export interface PluginRegistry {
  register(plugin: LoadedPlugin): void;
  unregister(id: string): void;
  get(id: string): LoadedPlugin | undefined;
  getAll(): LoadedPlugin[];
  getByCapability(capability: PluginCapability): LoadedPlugin[];
  getTools(): AgentTool[];
  getServices(): PluginService[];
  /** Get services with plugin name for display purposes */
  getEnrichedServices(): EnrichedService[];
  /** Get all hooks with plugin name for display purposes */
  getAllEnrichedHooks(): EnrichedHook[];
  /** Get tool names filtered by plugin name prefix */
  getToolNamesByPlugin(pluginName: string): string[];

  // Phase 64: Enable/Disable Support
  /** Enable a plugin by ID */
  enable(id: string): boolean;
  /** Disable a plugin by ID */
  disable(id: string): boolean;
  /** Check if a plugin is enabled */
  isEnabled(id: string): boolean;
  /** Get enabled plugins only */
  getEnabled(): LoadedPlugin[];
  /** Get disabled plugins only */
  getDisabled(): LoadedPlugin[];

  // Phase 64: Error Handling
  /** Record a plugin error */
  setError(id: string, error: PluginError): void;
  /** Get error for a plugin */
  getError(id: string): PluginError | undefined;
  /** Clear error for a plugin */
  clearError(id: string): void;
  /** Get all plugin errors */
  getAllErrors(): Array<{ id: string; error: PluginError }>;
  /** Get plugins with errors */
  getPluginsWithErrors(): string[];
}

// ============================================================================
// Plugin Errors
// ============================================================================

export class PluginError extends Error {
  constructor(
    message: string,
    public code: string,
    public pluginId?: string
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

export class PluginLoadError extends PluginError {
  constructor(message: string, pluginId?: string) {
    super(message, 'PLUGIN_LOAD_ERROR', pluginId);
  }
}

export class PluginRuntimeError extends PluginError {
  constructor(message: string, runtime: PluginRuntime, pluginId?: string) {
    super(message, `RUNTIME_${runtime.toUpperCase()}`, pluginId);
  }
}

export class PluginConfigError extends PluginError {
  constructor(message: string, pluginId?: string) {
    super(message, 'PLUGIN_CONFIG_ERROR', pluginId);
  }
}