/**
 * Path utilities for UpUp
 *
 * Re-exports from storage-paths.ts for compatibility.
 * All path constants should be defined in storage-paths.ts.
 */

import { join, resolve, relative, isAbsolute } from 'node:path';
import { cwd as processCwd } from 'node:process';
import { existsSync, mkdirSync } from 'fs';
import { getUpupDir, globalUpupPath } from './storage-paths.js';

// Re-export from storage-paths for compatibility
export {
  getUpupDir,
  globalUpupPath,
  upupPath,
  SETTINGS_FILE,
  ENV_FILE,
  SESSIONS_DIR,
  PID_SESSIONS_DIR,
  MEMORY_DIR,
  CACHE_DIR,
  LOGS_DIR,
  TOOL_RESULTS_DIR,
  SCRATCHPAD_DIR,
  EXPORTS_DIR,
  PLANS_DIR,
  PORTFOLIOS_DIR,
  HOOKS_DIR,
  SKILLS_DIR,
  PLUGINS_DIR,
  MCP_CONFIG_FILE,
  MCP_SERVERS_FILE,
} from './storage-paths.js';


/**
 * Get the current working directory
 */
export function getCwd(): string {
  return processCwd();
}

/**
 * Resolve a relative path to an absolute path
 */
export function expandPath(path: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  return resolve(getCwd(), path);
}

/**
 * Convert an absolute path to a relative path from cwd
 */
export function toRelativePath(absolutePath: string): string {
  const cwd = getCwd();
  try {
    const rel = relative(cwd, absolutePath);
    // If the result is not a relative path (starts with ..), use absolute path
    if (rel.startsWith('..')) {
      return absolutePath;
    }
    return rel;
  } catch {
    return absolutePath;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if global configuration directory exists.
 */
export function hasGlobalConfig(): boolean {
  return existsSync(getUpupDir());
}
