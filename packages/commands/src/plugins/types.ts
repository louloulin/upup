// @ts-nocheck
/**
 * Plugin System Types
 *
 * Defines types for the plugin system.
 * Based on Claude Code's plugin format.
 */

/**
 * Plugin manifest
 */
export interface PluginManifest {
  name: string
  description?: string
  version?: string
  author?: string
  enabled?: boolean
  commands?: PluginCommand[]
  skills?: PluginSkill[]
}

/**
 * Plugin command definition
 */
export interface PluginCommand {
  name: string
  description: string
  aliases?: string[]
  argumentHint?: string
  load?: string
  type?: 'local' | 'local-jsx' | 'prompt'
  allowedTools?: string[]
  effort?: 'minimal' | 'short' | 'medium' | 'long' | 'extended'
  whenToUse?: string
}

/**
 * Plugin skill definition
 */
export interface PluginSkill {
  name: string
  description: string
  content: string
  frontmatter?: Record<string, unknown>
}

/**
 * Loaded plugin
 */
export interface Plugin {
  id: string
  name: string
  description?: string
  version?: string
  source: 'user' | 'bundled' | 'managed'
  enabled: boolean
  filePath?: string
  commands: PluginCommand[]
  skills: PluginSkill[]
  content?: string
  lastModified?: number
}

/**
 * Plugin loading result
 */
export interface LoadPluginResult {
  success: boolean
  plugins: Plugin[]
  error?: string
}

/**
 * Plugin registry interface
 */
export interface IPluginRegistry {
  loadAll(): Promise<void>
  get(name: string): Plugin | undefined
  list(): Plugin[]
  listEnabled(): Plugin[]
  enable(name: string): void
  disable(name: string): void
  reload(): Promise<void>
}

/**
 * Default plugin directories
 */
export const DEFAULT_PLUGIN_DIRS = {
  user: '.claude/plugins',
  bundled: '.claude/plugins/bundled',
  managed: '~/.claude/plugins',
}

/**
 * Plugin file extensions
 */
export const PLUGIN_EXTENSIONS = ['.md', '.txt', '.json']