/**
 * UpUp Plugin System — Path Safety
 *
 * Ensures plugin files don't escape their boundaries.
 * Inspired by OpenClaw's path-safety.ts implementation.
 */

import { statSync, realpathSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { warn } from '../utils/logging/logger.js';

// ============================================================================
// Path Safety Functions
// ============================================================================

/**
 * Check if a path is inside a directory boundary
 */
export function isPathInside(path: string, boundary: string): boolean {
  const resolvedPath = resolve(path);
  const resolvedBoundary = resolve(boundary);

  // Must start with boundary
  if (!resolvedPath.startsWith(resolvedBoundary)) {
    return false;
  }

  // Must be either:
  // 1. Same as boundary (the directory itself)
  // 2. Inside with a path separator
  const afterBoundary = resolvedPath.slice(resolvedBoundary.length);
  return afterBoundary === '' || afterBoundary.startsWith('/') || afterBoundary.startsWith('\\');
}

/**
 * Safe stat that returns null on error instead of throwing
 */
export function safeStatSync(path: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

/**
 * Safe realpath that falls back to resolve on error
 */
export function safeRealpathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Open a file only if it's inside the boundary (path safety check)
 */
export function openBoundaryFileSync(
  filePath: string,
  boundary: string,
  options?: { flags?: string; encoding?: BufferEncoding }
): { fd: number; path: string } | null {
  const resolvedFile = resolve(filePath);
  const resolvedBoundary = resolve(boundary);

  if (!isPathInside(resolvedFile, resolvedBoundary)) {
    warn('default', `Path safety violation: ${filePath} is outside boundary ${boundary}`);
    return null;
  }

  // Check for hardlinks (reject for non-bundled plugins)
  const stat = safeStatSync(resolvedFile);
  if (stat && stat.nlink > 1) {
    warn('default', `Hardlink rejected: ${filePath} (nlink=${stat.nlink})`);
    return null;
  }

  // Open the file
  try {
    const fs = require('fs') as typeof import('fs');
    const fd = fs.openSync(resolvedFile, options?.flags ?? 'r');
    return { fd, path: resolvedFile };
  } catch (err) {
    warn('default', `Failed to open file: ${filePath} — ${(err as Error).message}`);
    return null;
  }
}

/**
 * Validate a plugin directory is safe to load
 */
export function validatePluginDirectory(dirPath: string, allowWorldWritable = false): {
  valid: boolean;
  reason?: string;
} {
  const stat = safeStatSync(dirPath);
  if (!stat) {
    return { valid: false, reason: 'Directory does not exist' };
  }

  if (!stat.isDirectory()) {
    return { valid: false, reason: 'Path is not a directory' };
  }

  // Check world-writable (security risk)
  if (!allowWorldWritable && (Number(stat.mode) & 0o002) !== 0) {
    return { valid: false, reason: 'Directory is world-writable (security risk)' };
  }

  return { valid: true };
}

/**
 * Validate a plugin entry file is safe to load
 */
export function validatePluginEntry(
  entryPath: string,
  pluginRoot: string,
  rejectHardlinks = true
): { valid: boolean; reason?: string } {
  const stat = safeStatSync(entryPath);
  if (!stat) {
    return { valid: false, reason: 'Entry file does not exist' };
  }

  if (!stat.isFile()) {
    return { valid: false, reason: 'Entry path is not a file' };
  }

  // Path safety check
  if (!isPathInside(entryPath, pluginRoot)) {
    return { valid: false, reason: 'Entry file escapes plugin boundary' };
  }

  // Check world-writable
  if ((Number(stat.mode) & 0o002) !== 0) {
    return { valid: false, reason: 'Entry file is world-writable (security risk)' };
  }

  // Hardlink rejection (security risk for non-bundled)
  if (rejectHardlinks && stat.nlink > 1) {
    return { valid: false, reason: 'Entry file is a hardlink (security risk)' };
  }

  return { valid: true };
}

/**
 * Resolve a relative path within a plugin directory
 */
export function resolvePluginPath(relativePath: string, pluginRoot: string): string {
  const resolved = resolve(pluginRoot, relativePath);
  if (!isPathInside(resolved, pluginRoot)) {
    throw new Error(`Path resolution would escape plugin boundary: ${relativePath}`);
  }
  return resolved;
}

/**
 * Check if a file exists inside a plugin directory
 */
export function pluginFileExists(relativePath: string, pluginRoot: string): boolean {
  try {
    const fullPath = resolvePluginPath(relativePath, pluginRoot);
    return existsSync(fullPath);
  } catch {
    return false;
  }
}