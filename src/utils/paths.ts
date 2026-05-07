import { join, resolve, relative, isAbsolute } from 'node:path';
import { cwd as processCwd } from 'node:process';

const DEXTER_DIR = '.dexter';

export function getDexterDir(): string {
  return DEXTER_DIR;
}

export function dexterPath(...segments: string[]): string {
  return join(getDexterDir(), ...segments);
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
