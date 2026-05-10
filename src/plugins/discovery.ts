/**
 * UpUp Plugin System — Plugin Discovery
 *
 * Discovers plugins from 4 sources: bundled, global, workspace, npm.
 * Based on OpenClaw's discovery.ts pattern.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { info, warn } from '../utils/logging/logger.js';
import { loadPluginManifest, getManifestLoader } from './manifest.js';
import { isPathInside, safeStatSync } from './path-safety.js';
import type { DiscoveredPlugin, PluginSource, PluginManifest } from './types.js';

// ============================================================================
// Discovery Options
// ============================================================================

export interface DiscoveryOptions {
  /** Sources to discover from */
  sources?: PluginSource[];
  /** Workspace directory for workspace plugins */
  workspaceDir?: string;
  /** Global plugins directory */
  globalDir?: string;
  /** Require plugins to be explicitly enabled */
  requireEnabled?: boolean;
}

// ============================================================================
// Source Directory Resolution
// ============================================================================

/**
 * Get the global plugins directory
 */
export function getGlobalPluginsDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return resolve(home, '.upup', 'plugins');
}

/**
 * Get workspace plugins directory
 */
export function getWorkspacePluginsDir(workspaceDir: string): string {
  return resolve(workspaceDir, '.upup', 'plugins');
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Discover plugins from all configured sources
 */
export async function discoverPlugins(options: DiscoveryOptions = {}): Promise<DiscoveredPlugin[]> {
  const plugins: DiscoveredPlugin[] = [];
  const sources = options.sources ?? ['bundled', 'global', 'workspace', 'npm'];

  info('default', `Discovering plugins from sources: ${sources.join(', ')}`);

  for (const source of sources) {
    try {
      const discovered = await discoverFromSource(source, options);
      plugins.push(...discovered);
    } catch (err) {
      warn('default', `Failed to discover plugins from ${source}: ${(err as Error).message}`);
    }
  }

  info('default', `Discovered ${plugins.length} plugin(s)`);
  return plugins;
}

/**
 * Discover plugins from a specific source
 */
async function discoverFromSource(
  source: PluginSource,
  options: DiscoveryOptions
): Promise<DiscoveredPlugin[]> {
  switch (source) {
    case 'bundled':
      return discoverBundled(options);
    case 'global':
      return discoverGlobal(options);
    case 'workspace':
      return discoverWorkspace(options);
    case 'npm':
      return discoverNpm(options);
    default:
      return [];
  }
}

/**
 * Discover bundled plugins (compiled at build time)
 */
async function discoverBundled(_options: DiscoveryOptions): Promise<DiscoveredPlugin[]> {
  // Bundled plugins are registered via build-time configuration
  // This implementation placeholder for future bundler integration
  return [];
}

/**
 * Discover global plugins from ~/.upup/plugins
 */
async function discoverGlobal(options: DiscoveryOptions): Promise<DiscoveredPlugin[]> {
  const globalDir = options.globalDir ?? getGlobalPluginsDir();
  return discoverFromDirectory(globalDir, 'global');
}

/**
 * Discover workspace plugins from <workspace>/.upup/plugins
 */
async function discoverWorkspace(options: DiscoveryOptions): Promise<DiscoveredPlugin[]> {
  if (!options.workspaceDir) {
    return [];
  }
  const workspaceDir = getWorkspacePluginsDir(options.workspaceDir);
  return discoverFromDirectory(workspaceDir, 'workspace');
}

/**
 * Discover npm installed plugins
 */
async function discoverNpm(_options: DiscoveryOptions): Promise<DiscoveredPlugin[]> {
  // NPM plugins would be discovered via package.json dependencies
  // with upup-plugin convention
  // Implementation: scan node_modules for @upup/plugin-* packages
  return [];
}

/**
 * Discover plugins from a directory
 */
async function discoverFromDirectory(
  dirPath: string,
  source: PluginSource
): Promise<DiscoveredPlugin[]> {
  const plugins: DiscoveredPlugin[] = [];

  if (!existsSync(dirPath)) {
    return plugins;
  }

  // Check directory permissions
  const stat = safeStatSync(dirPath);
  if (!stat || !stat.isDirectory()) {
    return plugins;
  }

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = resolve(dirPath, entry.name);
      const manifestPath = resolve(pluginPath, 'upup.plugin.json');

      if (!existsSync(manifestPath)) continue;

      // Skip non-directory manifest locations
      if (!safeStatSync(manifestPath)?.isFile()) continue;

      try {
        const manifest = loadPluginManifest(pluginPath);
        plugins.push({
          source,
          path: pluginPath,
          manifest,
        });
        info('default', `Discovered ${source} plugin: ${manifest.id} at ${pluginPath}`);
      } catch (err) {
        warn('default', `Invalid plugin manifest in ${entry.name}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    warn('default', `Cannot read plugin directory ${dirPath}: ${(err as Error).message}`);
  }

  return plugins;
}

// ============================================================================
// Plugin Filtering
// ============================================================================

/**
 * Filter plugins by enabled state
 */
export function filterEnabledPlugins(
  plugins: DiscoveredPlugin[],
  enabledIds: string[] = []
): DiscoveredPlugin[] {
  if (enabledIds.length === 0) {
    // If no enabled list, return all
    return plugins;
  }

  return plugins.filter(p => enabledIds.includes(p.manifest.id));
}

// ============================================================================
// Discovery Utilities
// ============================================================================

/**
 * Check if a path is within a safe plugin directory
 */
export function isSafePluginPath(pluginPath: string, workspaceDir?: string): boolean {
  // Must be a directory
  const stat = safeStatSync(pluginPath);
  if (!stat || !stat.isDirectory()) {
    return false;
  }

  // Must contain upup.plugin.json
  const manifestPath = resolve(pluginPath, 'upup.plugin.json');
  if (!existsSync(manifestPath)) {
    return false;
  }

  // If workspace specified, must be within workspace
  if (workspaceDir && !isPathInside(pluginPath, workspaceDir)) {
    return false;
  }

  return true;
}

/**
 * Get plugin ID from directory name
 */
export function derivePluginId(dirName: string): string {
  // Remove @scope/ prefix if present
  const name = dirName.startsWith('@') ? dirName.split('/')[1] ?? dirName : dirName;
  // Convert to kebab-case
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}