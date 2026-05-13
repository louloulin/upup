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

/**
 * Get the UpUp configuration directory (~/.upup/)
 *
 * Uses global directory for cross-project data sharing.
 * Auto-migrates from .dexter if needed.
 */
export function getUpupDir(): string {
  const globalDir = globalUpupPath();

  // Auto-migration: .dexter → .upup on first run
  const oldLocalDir = '.dexter';
  if (!existsSync(globalDir) && existsSync(oldLocalDir)) {
    // Try to migrate from local .dexter
    try {
      mkdirSync(globalDir, { recursive: true });
      renameSync(oldLocalDir, globalDir + '.old');
      console.log(`[upup] Migrated config: ${oldLocalDir} → ${globalDir}`);
    } catch {
      // Migration failed, just use global dir
    }
  }

  // Ensure global directory exists
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }

  return globalDir;
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
