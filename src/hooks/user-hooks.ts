/**
 * User Hook Loader — scans and loads .upup/hooks/*.ts files
 * Supports both global (~/.upup/hooks/) and project (.upup/hooks/) hooks.
 * Project hooks take precedence over global hooks (by name).
 *
 * Provides a mechanism for users to define custom hooks that
 * integrate with UpUp's hook lifecycle system.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'node:path';
import { info, warn } from '../utils/logging/logger.js';
import { globalUpupPath, upupPath } from '../utils/paths.js';
import type { HookEvent } from './tool-hooks.js';

// Type for user hook modules — they should export a default function
// or named exports matching hook events
export interface UserHookModule {
  default?: (event: HookEvent, params: any) => Promise<void>;
  PreToolUse?: (params: any) => Promise<void>;
  PostToolUse?: (params: any) => Promise<void>;
  PostToolUseFailure?: (params: any) => Promise<void>;
  PreCompact?: (params: any) => Promise<void>;
  PostCompact?: (params: any) => Promise<void>;
  [key: string]: ((...args: any[]) => Promise<any>) | undefined;
}

interface LoadedHook {
  name: string;
  path: string;
  module: UserHookModule;
  source: 'global' | 'project';
}

let loadedHooks: LoadedHook[] = [];
let loaded = false;

/**
 * Get the project hooks directory path
 */
function getProjectHooksDir(): string {
  return join(process.cwd(), '.upup', 'hooks');
}

/**
 * Get the global hooks directory path
 */
function getGlobalHooksDir(): string {
  return globalUpupPath('hooks');
}

/**
 * Load hooks from a directory.
 * Returns a map of hook name to hook module (for deduplication).
 */
async function loadHooksFromDir(hooksDir: string, source: 'global' | 'project'): Promise<Map<string, LoadedHook>> {
  const hooks = new Map<string, LoadedHook>();

  if (!existsSync(hooksDir)) {
    return hooks;
  }

  try {
    const files = readdirSync(hooksDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();

    for (const file of files) {
      const filePath = join(hooksDir, file);
      const hookName = file.replace(/\.(ts|js)$/, '');
      try {
        const mod = await import(filePath) as UserHookModule;
        hooks.set(hookName, {
          name: hookName,
          path: filePath,
          module: mod,
          source,
        });
      } catch (err) {
        warn('system', `Failed to load hook ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    warn('system', `Failed to scan hooks directory ${hooksDir}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return hooks;
}

/**
 * Load all user hooks from global and project hooks directories.
 * - Global hooks: ~/.upup/hooks/
 * - Project hooks: .upup/hooks/
 * Project hooks take precedence over global hooks (by name).
 *
 * @returns Number of hooks loaded
 */
export async function loadUserHooks(): Promise<number> {
  if (loaded) return loadedHooks.length;

  // Load global hooks first
  const globalHooksDir = getGlobalHooksDir();
  const globalHooks = await loadHooksFromDir(globalHooksDir, 'global');

  // Load project hooks second (overrides global)
  const projectHooksDir = getProjectHooksDir();
  const projectHooks = await loadHooksFromDir(projectHooksDir, 'project');

  // Merge: project hooks override global hooks
  for (const [name, hook] of globalHooks) {
    if (!projectHooks.has(name)) {
      loadedHooks.push(hook);
    }
  }
  for (const [, hook] of projectHooks) {
    loadedHooks.push(hook);
  }

  // Log loaded hooks
  const globalCount = globalHooks.size;
  const projectCount = projectHooks.size;
  if (globalCount > 0) {
    info('system', `Loaded ${globalCount} global hook(s) from ${globalHooksDir}`);
  }
  if (projectCount > 0) {
    info('system', `Loaded ${projectCount} project hook(s) from ${projectHooksDir}`);
  }
  info('system', `Total: ${loadedHooks.length} hook(s) loaded (project overrides global)`);

  loaded = true;
  return loadedHooks.length;
}

/**
 * Get all loaded user hooks
 */
export function getLoadedUserHooks(): ReadonlyArray<Readonly<LoadedHook>> {
  return loadedHooks;
}

/**
 * Get user hook functions for a specific event type.
 * Returns an array of functions from all loaded user hooks that define this event.
 */
export function getUserHooksForEvent(eventType: string): Array<(params: any) => Promise<void>> {
  const hooks: Array<(params: any) => Promise<void>> = [];

  for (const hook of loadedHooks) {
    const fn = hook.module[eventType];
    if (typeof fn === 'function') {
      hooks.push(fn);
    }
    // Also check default export — it receives (event, params)
    if (eventType !== 'default' && hook.module.default) {
      hooks.push(async (params: any) => {
        await hook.module.default!(eventType as HookEvent, params);
      });
    }
  }

  return hooks;
}

/**
 * Reset loaded hooks (for testing)
 */
export function resetUserHooks(): void {
  loadedHooks = [];
  loaded = false;
}
