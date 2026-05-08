/**
 * Path Validation Module
 *
 * Validates file paths for security:
 * - Path traversal prevention
 * - Symbolic link handling
 * - Allowed/denied directory patterns
 * - Real path resolution
 *
 * Reference: Loucode's pathValidation.ts
 */

import { stat } from 'fs/promises';
import { access } from 'fs/promises';
import { realpath } from 'fs/promises';
import { constants } from 'fs';
import { resolve, isAbsolute, join, normalize } from 'path';
import { existsSync } from 'fs';
import { getCwd } from '../../utils/cwd.js';

// ============================================================================
// Types
// ============================================================================

export interface PathValidationResult {
  valid: boolean;
  reason?: string;
  warning?: string;
  resolvedPath?: string;
}

export interface PathConstraint {
  /** Allowed directory patterns (glob) */
  allowedDirs?: string[];
  /** Denied directory patterns (glob) */
  deniedDirs?: string[];
  /** Deny path traversal */
  denyTraversal?: boolean;
  /** Allow symbolic links */
  allowSymlinks?: boolean;
  /** Block system paths */
  blockSystemPaths?: boolean;
}

export interface PathConstraintsConfig {
  /** Default constraints for all operations */
  defaults: PathConstraint;
  /** Constraints by operation type */
  byOperation: Record<string, PathConstraint>;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * System paths that should be protected
 */
export const PROTECTED_PATHS = [
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/passwd', // Read-only for some operations
  '/etc/group',
  '/etc/gshadow',
  '/etc/security/opasswd',
  '/root/.ssh',
  '/.ssh',
  '/home/*/.ssh',
  '/var/log/secure',
  '/var/log/auth.log',
  '/var/log/syslog',
  '/proc/self/environ',
  '/proc/self/cmdline',
  '/sys/kernel/security',
];

/**
 * Patterns for sensitive paths
 */
export const SENSITIVE_PATH_PATTERNS = [
  /^\/etc\/(shadow|sudoers|gshadow|opasswd)/,
  /^\/root\/.ssh/,
  /^\/\.ssh/,
  /^\/home\/[^\/]+\/\.ssh/,
  /^\/var\/log\/secure/,
  /^\/var\/log\/auth\.log/,
  /^\/var\/log\/syslog/,
  /^\/proc\/self\//,
  /^\/sys\/kernel\/security/,
  /^\/sys\/fs\/selinux/,
  /^\/etc\/selinux/,
  /^\/boot\/grub/,
  /\.ssh\/authorized_keys$/,
  /\.ssh\/id_.*$/,
  /\.ssh\/known_hosts$/,
  /\.git\/objects\/.*\/[a-f0-9]{38,}/, // Git object files
  /\.env$/, // Environment files
  /\.npmrc$/, // NPM credentials
  /\.pypirc$/, // PyPI credentials
  /\.gem\/credentials$/, // Gem credentials
  /credentials\.json$/,
  /secrets\.ya?ml$/,
  /passwords?\.txt$/,
  /\.aws\/credentials$/,
  /\.docker\/config\.json$/,
];

/**
 * Path traversal patterns
 */
const TRAVERSAL_PATTERNS = [
  /\.\./,  // Path traversal
  /\/~\//,  // Tilde expansion
  /%2e%2e/i, // URL-encoded traversal
  /%252e%252e/i, // Double URL-encoded traversal
];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a single path
 */
export function validatePath(
  path: string,
  cwd: string = getCwd(),
  constraints: PathConstraint = {}
): PathValidationResult {
  const {
    allowedDirs = ['*'],
    deniedDirs = [],
    denyTraversal = true,
    blockSystemPaths = true,
  } = constraints;

  // Skip empty paths
  if (!path || path.trim() === '') {
    return { valid: false, reason: 'Empty path' };
  }

  // Skip command-like words that might be parsed as paths
  if (isCommandWord(path)) {
    return { valid: true };
  }

  // Resolve relative paths
  let resolvedPath: string;
  try {
    if (isAbsolute(path)) {
      resolvedPath = normalize(path);
    } else {
      resolvedPath = resolve(cwd, path);
    }
  } catch {
    return { valid: false, reason: 'Invalid path syntax' };
  }

  // Check for path traversal
  if (denyTraversal && containsTraversal(resolvedPath)) {
    return {
      valid: false,
      reason: 'Path traversal detected',
      resolvedPath,
    };
  }

  // Check system paths
  if (blockSystemPaths) {
    const systemCheck = checkSystemPath(resolvedPath);
    if (!systemCheck.allowed) {
      return {
        valid: false,
        reason: systemCheck.reason,
        resolvedPath,
      };
    }
    if (systemCheck.warning) {
      return {
        valid: true,
        warning: systemCheck.warning,
        resolvedPath,
      };
    }
  }

  // Check allowed directories
  if (!matchesAnyPattern(resolvedPath, allowedDirs)) {
    return {
      valid: false,
      reason: `Path not in allowed directories: ${allowedDirs.join(', ')}`,
      resolvedPath,
    };
  }

  // Check denied directories
  if (matchesAnyPattern(resolvedPath, deniedDirs)) {
    return {
      valid: false,
      reason: `Path in denied directories: ${deniedDirs.join(', ')}`,
      resolvedPath,
    };
  }

  return { valid: true, resolvedPath };
}

/**
 * Validate multiple paths from a command
 */
export function validatePaths(
  paths: string[],
  cwd: string = getCwd(),
  constraints: PathConstraint = {}
): { valid: boolean; reason?: string; validated: PathValidationResult[] } {
  const validated: PathValidationResult[] = [];

  for (const path of paths) {
    const result = validatePath(path, cwd, constraints);
    validated.push(result);

    if (!result.valid) {
      return {
        valid: false,
        reason: `Invalid path: ${path} - ${result.reason}`,
        validated,
      };
    }
  }

  return { valid: true, validated };
}

/**
 * Check if a string is a command word (not a path)
 */
function isCommandWord(word: string): boolean {
  const commonCommands = new Set([
    'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'awk', 'sed',
    'cut', 'sort', 'uniq', 'wc', 'head', 'tail', 'less', 'more',
    'mkdir', 'rmdir', 'touch', 'chmod', 'chown', 'chgrp', 'cp', 'mv', 'ln',
    'curl', 'wget', 'ssh', 'scp', 'rsync',
    'git', 'svn', 'hg',
    'npm', 'yarn', 'pnpm', 'pip', 'cargo',
    'python', 'python3', 'node', 'ruby', 'perl', 'php',
    'ps', 'top', 'htop', 'kill', 'pkill', 'killall',
    'df', 'du', 'free', 'uname', 'hostname', 'ifconfig', 'ip',
    'true', 'false', 'test', 'exit', 'export', 'unset', 'source',
    'eval', 'exec', 'trap', 'wait', 'jobs', 'fg', 'bg',
    'tee', 'xargs', 'yes', 'seq', 'date', 'sleep', 'timeout',
    'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'xz',
    'make', 'gcc', 'g++', 'clang', 'rustc', 'go', 'javac', 'java',
    'docker', 'kubectl', 'helm', 'terraform', 'ansible', 'vagrant',
    'systemctl', 'service', 'journalctl', 'crontab', 'at',
    'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel',
    'passwd', 'su', 'sudo',
  ]);
  return commonCommands.has(word.toLowerCase());
}

/**
 * Check for path traversal patterns
 */
function containsTraversal(path: string): boolean {
  // Check for ../
  if (path.includes('../') || path.includes('..\\')) {
    return true;
  }

  // Check for /..
  if (/\/\.\./.test(path) || /\\\.\./.test(path)) {
    return true;
  }

  // Check for trailing ..
  if (path.endsWith('/..') || path.endsWith('\\..')) {
    return true;
  }

  // Check for ~
  if (path.includes('/~/') || path.startsWith('~/')) {
    return true;
  }

  return false;
}

/**
 * Check if path is a system path
 */
function checkSystemPath(path: string): { allowed: boolean; reason?: string; warning?: string } {
  const normalized = normalize(path);

  // Check protected paths
  for (const protectedPath of PROTECTED_PATHS) {
    if (normalized.startsWith(protectedPath)) {
      // Some paths are read-only warnings, not outright denied
      if (protectedPath.includes('passwd')) {
        return { allowed: true, warning: `Accessing ${protectedPath}` };
      }
      return { allowed: false, reason: `Protected system path: ${protectedPath}` };
    }
  }

  // Check sensitive patterns
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      if (pattern.toString().includes('shadow') ||
          pattern.toString().includes('sudoers') ||
          pattern.toString().includes('gshadow') ||
          pattern.toString().includes('opasswd')) {
        return { allowed: false, reason: `Sensitive system file: ${normalized}` };
      }
      if (pattern.toString().includes('.ssh') || pattern.toString().includes('credentials')) {
        return { allowed: false, reason: `Sensitive file with credentials: ${normalized}` };
      }
      return { allowed: true, warning: `Sensitive path: ${normalized}` };
    }
  }

  return { allowed: true };
}

/**
 * Check if a path matches any glob pattern
 */
function matchesAnyPattern(path: string, patterns: string[]): boolean {
  if (patterns.length === 0 || (patterns.length === 1 && patterns[0] === '*')) {
    return true;
  }

  for (const pattern of patterns) {
    if (matchGlob(pattern, path)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob pattern matching
 */
function matchGlob(pattern: string, path: string): boolean {
  // Convert glob to regex
  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\*\*/g, '.*')
    .replace(/\?/g, '.');

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(path);
  } catch {
    // Invalid pattern, treat as literal
    return path === pattern;
  }
}

/**
 * Check if a path exists and is accessible
 */
export async function checkPathAccess(path: string): Promise<{
  exists: boolean;
  readable: boolean;
  writable: boolean;
}> {
  try {
    await access(path, constants.F_OK);
    const readable = await checkAccess(path, constants.R_OK);
    const writable = await checkAccess(path, constants.W_OK);
    return { exists: true, readable, writable };
  } catch {
    return { exists: false, readable: false, writable: false };
  }
}

/**
 * Check if path is accessible with specific mode
 */
async function checkAccess(path: string, mode: number): Promise<boolean> {
  try {
    await access(path, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a path and follow symlinks
 */
export async function resolveRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

/**
 * Get path info (exists, type, size)
 */
export async function getPathInfo(
  path: string
): Promise<{
  exists: boolean;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size?: number;
  mode?: number;
}> {
  try {
    const stats = await stat(path);
    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymlink: stats.isSymbolicLink(),
      size: stats.size,
      mode: stats.mode,
    };
  } catch {
    return {
      exists: false,
      isFile: false,
      isDirectory: false,
      isSymlink: false,
    };
  }
}

/**
 * Check for symlink traversal vulnerability
 */
export async function checkSymlinkVulnerability(
  path: string,
  baseDir: string
): Promise<{ vulnerable: boolean; reason?: string }> {
  try {
    const resolved = await resolveRealPath(path);
    const baseResolved = await resolveRealPath(baseDir);

    // Check if resolved path is outside base directory
    if (!resolved.startsWith(baseResolved + '/') && resolved !== baseResolved) {
      return {
        vulnerable: true,
        reason: `Symlink points outside base directory: ${resolved}`,
      };
    }

    return { vulnerable: false };
  } catch {
    return { vulnerable: false };
  }
}

// ============================================================================
// Module exports
// ============================================================================

export const pathValidation = {
  validatePath,
  validatePaths,
  checkPathAccess,
  resolveRealPath,
  getPathInfo,
  checkSymlinkVulnerability,
  PROTECTED_PATHS,
  SENSITIVE_PATH_PATTERNS,
};
