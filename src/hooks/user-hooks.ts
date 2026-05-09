/**
 * User Hook Loader — scans and loads .dexter/hooks/*.ts files
 *
 * Provides a mechanism for users to define custom hooks that
 * integrate with Dexter's hook lifecycle system.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { info, warn } from '../utils/logging/logger.js';
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
}

let loadedHooks: LoadedHook[] = [];
let loaded = false;

/**
 * Get the user hooks directory path
 */
function getHooksDir(): string {
  return join(process.cwd(), '.dexter', 'hooks');
}

/**
 * Load all user hooks from .dexter/hooks/ directory.
 * Each .ts file should export hook functions matching hook event names.
 *
 * @returns Number of hooks loaded
 */
export async function loadUserHooks(): Promise<number> {
  if (loaded) return loadedHooks.length;

  const hooksDir = getHooksDir();

  if (!existsSync(hooksDir)) {
    info('system', `No user hooks directory at ${hooksDir}`);
    loaded = true;
    return 0;
  }

  try {
    const files = readdirSync(hooksDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();

    for (const file of files) {
      const filePath = join(hooksDir, file);
      try {
        const mod = await import(filePath) as UserHookModule;
        loadedHooks.push({
          name: file.replace(/\.(ts|js)$/, ''),
          path: filePath,
          module: mod,
        });
        info('system', `Loaded user hook: ${file}`);
      } catch (err) {
        warn('system', `Failed to load user hook ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    info('system', `Loaded ${loadedHooks.length} user hook(s) from ${hooksDir}`);
  } catch (err) {
    warn('system', `Failed to scan hooks directory: ${err instanceof Error ? err.message : String(err)}`);
  }

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
