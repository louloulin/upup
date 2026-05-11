/**
 * UpUp Plugin System — Core Types
 *
 * Defines the unified plugin API that works across all runtimes:
 * bun (native ESM), jiti (TypeScript), wasm (Extism), mcp (external).
 */

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
  | 'service';

/** Hook execution modes */
export type HookExecutionMode = 'parallel' | 'sequential' | 'sync';

/** Security sandbox levels */
export type SandboxLevel = 'process' | 'wasm' | 'mcp' | 'none';

// ============================================================================
// Plugin Configuration
// ============================================================================

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

  // === Hook Registration ===
  registerHook(events: string[], handler: HookHandler, options?: HookOptions): void;
  on(event: string, handler: HookHandler, priority?: number): void;

  // === Channel Registration ===
  registerChannel(channel: ChannelPlugin): void;

  // === Command Registration ===
  registerCommand(command: PluginCommand): void;

  // === Service Registration ===
  registerService(service: PluginService): void;

  // === Data Source Registration ===
  registerDataSource(source: DataSourcePlugin): void;

  // === Utilities ===
  resolvePath(relativePath: string): string;

  // === Internal Access (for adapters) ===
  _tools?: AgentTool[];
  _services?: PluginService[];
  _hooks?: Map<string, { handler: HookHandler; options?: unknown }[]>;
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

// ============================================================================
// Service Types
// ============================================================================

export interface PluginService {
  name: string;
  start(ctx: ServiceContext): Promise<void>;
  stop?(ctx: ServiceContext): Promise<void>;
}

export interface ServiceContext {
  pluginId: string;
  config: Record<string, unknown>;
  logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
}

// ============================================================================
// Data Source Types
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
// Channel Types
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
