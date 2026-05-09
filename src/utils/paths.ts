import { join, resolve, relative, isAbsolute } from 'node:path';
import { cwd as processCwd } from 'node:process';
import { mkdirSync, existsSync, renameSync } from 'fs';

const UPUP_DIR = '.upup';
const OLD_DIR = '.dexter';

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
