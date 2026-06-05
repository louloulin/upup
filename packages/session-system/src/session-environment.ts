/**
 * Session Environment Management
 *
 * Handles environment variable and working directory restoration.
 * Captures and restores shell environment for session resume.
 *
 * Features:
 * - Shell environment capture (cwd, env, path)
 * - Working directory restoration
 * - Worktree session handling
 */

import { existsSync } from 'fs';
import { chdir } from 'process';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Shell environment snapshot
 */
export interface ShellEnvironment {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** PATH variable */
  path: string;
  /** Shell type (bash/zsh/fish) */
  shellType?: string;
  /** Capture timestamp */
  timestamp: number;
}

/**
 * Worktree session info
 */
export interface PersistedWorktreeSession {
  /** Session ID */
  sessionId: string;
  /** Worktree path */
  worktreePath: string;
  /** Parent branch */
  parentBranch: string;
  /** Created at */
  createdAt: number;
}

/**
 * Environment restoration result
 */
export interface EnvironmentRestoreResult {
  success: boolean;
  cwd: string;
  envCount: number;
  errors: string[];
}

// ============================================================================
// Internal State
// ============================================================================

/** Captured shell environment */
let _capturedEnvironment: ShellEnvironment | null = null;

/** Worktree sessions map */
const _worktreeSessions = new Map<string, PersistedWorktreeSession>();

// ============================================================================
// Environment Capture
// ============================================================================

/**
 * Capture the current shell environment.
 * Should be called when starting a session.
 *
 * @returns The captured shell environment
 */
export function captureShellEnvironment(): ShellEnvironment {
  const cwd = process.cwd();
  const env: Record<string, string> = {};

  // Capture relevant environment variables
  const relevantVars = [
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'TERM',
    'LANG',
    'LC_ALL',
    'EDITOR',
    'VISUAL',
    'PAGER',
    'GREP_OPTIONS',
    'NODE_ENV',
    'BUN_ENV',
    'npm_config_prefix',
    'CARGO_HOME',
    'RUSTUP_HOME',
    'GOROOT',
    'GOPATH',
    'PYTHONPATH',
    'JAVA_HOME',
    'ANDROID_HOME',
  ];

  for (const key of relevantVars) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }

  // Detect shell type
  const shell = process.env.SHELL || '';
  let shellType = 'unknown';
  if (shell.includes('bash')) shellType = 'bash';
  else if (shell.includes('zsh')) shellType = 'zsh';
  else if (shell.includes('fish')) shellType = 'fish';

  _capturedEnvironment = {
    cwd,
    env,
    path: process.env.PATH || '',
    shellType,
    timestamp: Date.now(),
  };

  return _capturedEnvironment;
}

/**
 * Get the captured shell environment.
 *
 * @returns The captured environment or null
 */
export function getCapturedEnvironment(): ShellEnvironment | null {
  return _capturedEnvironment;
}

/**
 * Check if environment has been captured.
 *
 * @returns True if environment is captured
 */
export function hasEnvironmentCapture(): boolean {
  return _capturedEnvironment !== null;
}

// ============================================================================
// Environment Restoration
// ============================================================================

/**
 * Restore the shell environment.
 * Restores cwd, env, and path from a captured environment.
 *
 * @param env - The environment to restore
 * @returns The restoration result
 */
export function restoreShellEnvironment(env: ShellEnvironment): EnvironmentRestoreResult {
  const errors: string[] = [];

  // Restore working directory
  try {
    if (env.cwd && existsSync(env.cwd)) {
      chdir(env.cwd);
    } else if (env.cwd) {
      errors.push(`Working directory does not exist: ${env.cwd}`);
    }
  } catch (error) {
    errors.push(`Failed to change directory: ${error}`);
  }

  // Restore environment variables
  let envCount = 0;
  for (const [key, value] of Object.entries(env.env)) {
    try {
      process.env[key] = value;
      envCount++;
    } catch (error) {
      errors.push(`Failed to set ${key}: ${error}`);
    }
  }

  // Restore PATH
  if (env.path) {
    process.env.PATH = env.path;
  }

  return {
    success: errors.length === 0,
    cwd: env.cwd,
    envCount,
    errors,
  };
}

/**
 * Restore the working directory only.
 *
 * @param cwd - The working directory to restore
 * @returns True if successful
 */
export function restoreWorkingDirectory(cwd: string): boolean {
  try {
    if (existsSync(cwd)) {
      chdir(cwd);
      return true;
    }
    console.warn(`[session-environment] Working directory does not exist: ${cwd}`);
    return false;
  } catch (error) {
    console.error(`[session-environment] Failed to restore working directory: ${error}`);
    return false;
  }
}

// ============================================================================
// Worktree Session Management
// ============================================================================

/**
 * Persist a worktree session.
 *
 * @param sessionId - The session ID
 * @param worktreePath - The worktree path
 * @param parentBranch - The parent branch name
 */
export function persistWorktreeSession(
  sessionId: string,
  worktreePath: string,
  parentBranch: string
): void {
  _worktreeSessions.set(sessionId, {
    sessionId,
    worktreePath,
    parentBranch,
    createdAt: Date.now(),
  });
}

/**
 * Get a worktree session by ID.
 *
 * @param sessionId - The session ID
 * @returns The worktree session or null
 */
export function getWorktreeSession(sessionId: string): PersistedWorktreeSession | null {
  return _worktreeSessions.get(sessionId) || null;
}

/**
 * Remove a worktree session.
 *
 * @param sessionId - The session ID
 */
export function removeWorktreeSession(sessionId: string): void {
  _worktreeSessions.delete(sessionId);
}

/**
 * List all worktree sessions.
 *
 * @returns Array of worktree sessions
 */
export function listWorktreeSessions(): PersistedWorktreeSession[] {
  return Array.from(_worktreeSessions.values());
}

/**
 * Get current worktree session.
 *
 * @returns The current worktree session or null
 */
export function getCurrentWorktreeSession(): PersistedWorktreeSession | null {
  // Find the most recent worktree session
  const sessions = listWorktreeSessions();
  if (sessions.length === 0) return null;

  return sessions.reduce((latest, current) =>
    current.createdAt > latest.createdAt ? current : latest
  );
}

/**
 * Check if in a worktree session.
 *
 * @returns True if in a worktree
 */
export function isInWorktreeSession(): boolean {
  const cwd = process.cwd();
  return cwd.includes('.git/worktrees') || cwd.includes('worktree');
}

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Validate environment for session resume.
 * Checks if critical paths and tools are available.
 *
 * @returns Validation result
 */
export function validateEnvironment(): {
  valid: boolean;
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check critical environment variables
  const required = ['HOME', 'PATH'];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  // Check if working directory exists
  const cwd = process.cwd();
  if (!existsSync(cwd)) {
    missing.push(`Working directory: ${cwd}`);
  }

  // Check for common development tools
  const commonTools = ['git', 'node', 'bun'];
  for (const tool of commonTools) {
    // Just a warning if not found - they're optional
    if (!process.env.PATH?.includes(tool)) {
      warnings.push(`Common tool not in PATH: ${tool}`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

// ============================================================================
// Export/Import
// ============================================================================

/**
 * Export current environment as JSON string.
 *
 * @returns JSON string of environment
 */
export function exportEnvironment(): string {
  const env: ShellEnvironment = {
    cwd: process.cwd(),
    env: { ...process.env } as Record<string, string>,
    path: process.env.PATH || '',
    shellType: detectShellType(),
    timestamp: Date.now(),
  };

  return JSON.stringify(env);
}

/**
 * Import environment from JSON string.
 *
 * @param json - JSON string of environment
 * @returns The restored environment
 */
export function importEnvironment(json: string): ShellEnvironment {
  try {
    const env = JSON.parse(json) as ShellEnvironment;
    restoreShellEnvironment(env);
    return env;
  } catch (error) {
    console.error(`[session-environment] Failed to import environment: ${error}`);
    throw error;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect the current shell type.
 *
 * @returns Shell type string
 */
function detectShellType(): string {
  const shell = process.env.SHELL || '';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('ksh')) return 'ksh';
  return 'unknown';
}

/**
 * Get environment summary for debugging.
 *
 * @returns Environment summary
 */
export function getEnvironmentSummary(): {
  cwd: string;
  shell: string;
  pathCount: number;
  envCount: number;
} {
  return {
    cwd: process.cwd(),
    shell: detectShellType(),
    pathCount: (process.env.PATH || '').split(':').length,
    envCount: Object.keys(process.env).length,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Capture
  captureShellEnvironment,
  getCapturedEnvironment,
  hasEnvironmentCapture,
  // Restore
  restoreShellEnvironment,
  restoreWorkingDirectory,
  // Worktree
  persistWorktreeSession,
  getWorktreeSession,
  removeWorktreeSession,
  listWorktreeSessions,
  getCurrentWorktreeSession,
  isInWorktreeSession,
  // Validation
  validateEnvironment,
  // Export/Import
  exportEnvironment,
  importEnvironment,
  // Helpers
  getEnvironmentSummary,
};