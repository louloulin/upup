import { join, resolve, relative, isAbsolute } from 'node:path';
import { cwd as processCwd } from 'node:process';
import { homedir } from 'node:os';
import { mkdirSync, existsSync, renameSync } from 'fs';

const UPUP_DIR = '.upup';
const OLD_DIR = '.dexter';

/**
 * Get the global UpUp configuration directory path (~/.upup/)
 * Used for cross-project configuration that applies to all UpUp sessions.
 */
export function globalUpupPath(...segments: string[]): string {
  return join(homedir(), '.upup', ...segments);
}

/**
 * Check if global configuration directory exists.
 */
export function hasGlobalConfig(): boolean {
  return existsSync(globalUpupPath(''));
}

export function getUpupDir(): string {
  // Auto-migration: .dexter → .upup on first run
  if (!existsSync(UPUP_DIR) && existsSync(OLD_DIR)) {
    renameSync(OLD_DIR, UPUP_DIR);
    console.log(`[upup] Migrated config: ${OLD_DIR} → ${UPUP_DIR}`);
  }
  return UPUP_DIR;
}

export function upupPath(...segments: string[]): string {
  return join(getUpupDir(), ...segments);
}


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
 * Standard UpUp storage directories (also re-exported from src/utils/storage-paths.ts).
 */
export const PLANS_DIR = globalUpupPath('plans');
export const PORTFOLIOS_DIR = globalUpupPath('portfolios');
export const WATCHLIST_FILE = globalUpupPath('watchlist.json');
export const SKILLS_DIR = globalUpupPath('skills');
export const PLUGINS_DIR = globalUpupPath('plugins');
export const HOOKS_DIR = globalUpupPath('hooks');
export const MEMORY_DIR = globalUpupPath('memory');
export const CACHE_DIR = globalUpupPath('cache');
export const LOGS_DIR = globalUpupPath('logs');
export const TOOL_RESULTS_DIR = globalUpupPath('tool-results');
export const SCRATCHPAD_DIR = globalUpupPath('scratchpad');
export const EXPORTS_DIR = globalUpupPath('exports');

/**
 * Session storage paths (consolidated from src/utils/storage-paths.ts).
 */
export const DATA_DIR = globalUpupPath('data');
export const SESSIONS_DIR = globalUpupPath('data', 'sessions');
export const PID_SESSIONS_DIR = globalUpupPath('sessions');
export const MESSAGES_DIR = globalUpupPath('messages');
export const TEAMS_DIR = globalUpupPath('teams');
export const AGENTS_DIR = globalUpupPath('agents');
export const PORTFOLIO_FILE = globalUpupPath('portfolio.json');
export const SETTINGS_FILE = globalUpupPath('settings.json');
export const SETTINGS_LOCAL_FILE = globalUpupPath('settings.local.json');
export const SETTINGS_DIR = globalUpupPath('settings.d');
export const SETTINGS_BACKUPS_DIR = globalUpupPath('backups');
export const SETTINGS_LOCK_FILE = globalUpupPath('settings.json.lock');

/**
 * Sanitize a project path into a filesystem-safe slug.
 */
export function sanitizePath(pathStr: string): string {
  return pathStr
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

/**
 * Get the per-project sessions directory.
 */
export function getProjectSessionsDir(projectPath: string): string {
  const sanitized = sanitizePath(projectPath);
  return globalUpupPath('data', 'sessions', sanitized);
}

/**
 * Get the default (no-project) sessions directory.
 */
export function getDefaultSessionsDir(): string {
  return globalUpupPath('data', 'sessions', 'default');
}
