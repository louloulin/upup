/**
 * CWD (Current Working Directory) utility
 *
 * Manages the current working directory for file operations.
 */

import { cwd } from 'node:process';
import { resolve as nodeResolve } from 'node:path';

/**
 * Get the current working directory
 */
export function getCwd(): string {
  return cwd();
}

/**
 * Resolve a relative path to an absolute path based on cwd
 */
export function resolveCwd(relativePath: string): string {
  return nodeResolve(getCwd(), relativePath);
}
