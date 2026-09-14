// @ts-nocheck
/**
 * Plugin Loader
 *
 * Loads plugins from filesystem directories.
 */

import type { Plugin, PluginCommand, LoadPluginResult } from './types.js'
import { DEFAULT_PLUGIN_DIRS } from './types.js'
import { expandHome } from '../utils/path.js'

/**
 * Parse plugin from markdown content
 */
function parsePluginFromMarkdown(
  content: string,
  filePath: string,
  source: 'user' | 'bundled' | 'managed' = 'user',
): Plugin | null {
  try {
    // Simple frontmatter parsing
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    let name = filePath.split('/').pop()?.replace(/\.(md|txt)$/, '') || 'unknown'
    let description = ''
    let frontmatter: Record<string, unknown> = {}
    let body = content

    if (match) {
      const [, fmStr, fmBody] = match
      frontmatter = parseFrontmatterString(fmStr)
      body = fmBody.trim()

      name = (frontmatter.name as string) || name
      description = (frontmatter.description as string) || ''
    }

    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      description,
      version: frontmatter.version as string,
      author: frontmatter.author as string,
      source,
      enabled: frontmatter.enabled !== false,
      filePath,
      commands: parseCommandsFromBody(body),
      skills: [],
      content: body,
      lastModified: Date.now(),
    }
  } catch {
    return null
  }
}

/**
 * Parse simple frontmatter string
 */
function parseFrontmatterString(str: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const line of str.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()

    if (value === 'true') {
      result[key] = true
    } else if (value === 'false') {
      result[key] = false
    } else {
      result[key] = value.replace(/^["']|["']$/g, '')
    }
  }

  return result
}

/**
 * Parse commands from markdown body
 */
function parseCommandsFromBody(body: string): PluginCommand[] {
  const commands: PluginCommand[] = []
  const commandRegex = /^##\s+([a-zA-Z0-9-]+)\s*\n([^\n#]*)/gm

  let match
  while ((match = commandRegex.exec(body)) !== null) {
    const [, name, description] = match
    commands.push({
      name: name.trim(),
      description: description.trim(),
      type: 'local',
    })
  }

  return commands
}

/**
 * Load plugins from a directory
 */
export async function loadPluginsFromDir(
  dirPath: string,
  source: 'user' | 'bundled' | 'managed' = 'user',
): Promise<Plugin[]> {
  const plugins: Plugin[] = []

  try {
    const { readdirSync, existsSync } = await import('fs')
    const { join } = await import('path')

    const expandedPath = expandHome(dirPath)
    if (!existsSync(expandedPath)) {
      return plugins
    }

    const entries = readdirSync(expandedPath, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile()) continue

      const fullPath = join(expandedPath, entry.name)
      const ext = entry.name.split('.').pop()?.toLowerCase()

      if (!['md', 'txt'].includes(ext || '')) continue

      try {
        const { readFileSync } = await import('fs')
        const content = readFileSync(fullPath, 'utf-8')
        const plugin = parsePluginFromMarkdown(content, fullPath, source)

        if (plugin) {
          plugins.push(plugin)
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Ignore directory errors
  }

  return plugins
}

/**
 * Load all plugins from configured directories
 */
export async function loadAllPlugins(
  cwd: string,
  config?: {
    userDir?: string
    bundledDir?: string
    managedDir?: string
  },
): Promise<LoadPluginResult> {
  const plugins: Plugin[] = []
  const errors: string[] = []

  // Load user plugins
  const userDir = config?.userDir ?? DEFAULT_PLUGIN_DIRS.user
  try {
    const userPlugins = await loadPluginsFromDir(
      `${cwd}/${userDir}`,
      'user',
    )
    plugins.push(...userPlugins)
  } catch (e) {
    errors.push(`Failed to load user plugins: ${e}`)
  }

  // Load bundled plugins
  const bundledDir = config?.bundledDir ?? DEFAULT_PLUGIN_DIRS.bundled
  try {
    const bundledPlugins = await loadPluginsFromDir(
      `${cwd}/${bundledDir}`,
      'bundled',
    )
    plugins.push(...bundledPlugins)
  } catch {
    // Bundled plugins are optional
  }

  // Load managed plugins
  const managedDir = config?.managedDir ?? DEFAULT_PLUGIN_DIRS.managed
  try {
    const managedPlugins = await loadPluginsFromDir(
      expandHome(managedDir),
      'managed',
    )
    plugins.push(...managedPlugins)
  } catch {
    // Managed plugins are optional
  }

  return {
    success: errors.length === 0,
    plugins,
    error: errors.join('\n'),
  }
}

/**
 * Convert plugin commands to Command objects
 */
export function pluginToCommands(plugin: Plugin): PluginCommand[] {
  if (plugin.commands.length > 0) {
    return plugin.commands
  }

  // If no commands defined, create a default command from plugin name
  return [
    {
      name: plugin.name,
      description: plugin.description || `Plugin: ${plugin.name}`,
      type: 'local',
    },
  ]
}