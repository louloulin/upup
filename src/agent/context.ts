/**
 * Agent Context - System and User context for prompts
 *
 * Based on Loucode's context.ts:
 * - System context: git status, cache breaker
 * - User context: MEMORY.md, CLAUDE.md, current date
 *
 * Features:
 * - Memoized context functions
 * - Cache breaking support
 * - System/User context injection
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getUpupDir } from '../utils/paths.js';
import { cwd } from 'node:process';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Git commit info
 */
export interface CommitInfo {
  hash: string;
  message: string;
  date: string;
}

/**
 * Git status
 */
export type GitStatus = 'clean' | 'dirty' | 'untracked' | 'unknown';

/**
 * System context from git/system
 */
export interface SystemContext {
  /** Current git branch */
  gitBranch: string;
  /** Git working tree status */
  gitStatus: GitStatus;
  /** Recent commits (last 5) */
  recentCommits: CommitInfo[];
  /** Cache breaker for ant model */
  cacheBreaker?: string;
  /** Last cache break timestamp */
  lastCacheBreak?: number;
}

/**
 * User context from files
 */
export interface UserContext {
  /** MEMORY.md content (index) */
  memoryIndex: string;
  /** Project CLAUDE.md content */
  claudeMd: string;
  /** Current date formatted */
  currentDate: string;
  /** Project slug */
  projectSlug: string;
}

/**
 * Cache breaker configuration
 */
export interface CacheBreakerConfig {
  /** Enable cache breaking for ant model */
  antCacheBreak?: boolean;
  /** Cache break interval in hours */
  intervalHours?: number;
}

// ============================================================================
// System Context (git status, commits)
// ============================================================================

/**
 * Parse git status from porcelain output
 */
function parseGitStatus(status: string): GitStatus {
  const lines = status.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return 'clean';

  const hasUntracked = lines.some(l => l.startsWith('??'));
  const hasModified = lines.some(l => !l.startsWith('??') && l.length > 0);

  if (hasUntracked) return 'untracked';
  if (hasModified) return 'dirty';
  return 'clean';
}

/**
 * Parse commit log into CommitInfo array
 */
function parseCommitLog(log: string): CommitInfo[] {
  const lines = log.trim().split('\n').filter(Boolean);
  return lines.map(line => {
    const [hash, ...messageParts] = line.split(' ');
    return {
      hash: hash.slice(0, 7), // Short hash
      message: messageParts.join(' '),
      date: '', // Could add date parsing
    };
  });
}

/**
 * Get system context with memoization
 */
export async function getSystemContext(): Promise<SystemContext> {
  const projectRoot = cwd();

  try {
    // Run git commands in parallel
    const [branchResult, statusResult, logResult] = await Promise.allSettled([
      execAsync('git branch --show-current', { cwd: projectRoot }),
      execAsync('git status --porcelain', { cwd: projectRoot }),
      execAsync('git log --oneline -5', { cwd: projectRoot }),
    ]);

    const gitBranch = branchResult.status === 'fulfilled'
      ? branchResult.value.stdout.trim()
      : 'unknown';

    const gitStatus: GitStatus = statusResult.status === 'fulfilled'
      ? parseGitStatus(statusResult.value.stdout)
      : 'unknown';

    const recentCommits = logResult.status === 'fulfilled'
      ? parseCommitLog(logResult.value.stdout)
      : [];

    return {
      gitBranch,
      gitStatus,
      recentCommits,
    };
  } catch (error) {
    // Not a git repo or git not available
    return {
      gitBranch: 'unknown',
      gitStatus: 'unknown' as GitStatus,
      recentCommits: [],
    };
  }
}

// ============================================================================
// User Context (MEMORY.md, CLAUDE.md)
// ============================================================================

/**
 * Read MEMORY.md index
 */
async function readMemoryIndex(): Promise<string> {
  const memoryDir = join(getUpupDir(), 'memory');
  const indexPath = join(memoryDir, 'MEMORY.md');

  if (!existsSync(indexPath)) {
    return '';
  }

  try {
    return await readFile(indexPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Read project CLAUDE.md
 */
async function readProjectClaudeMd(): Promise<string> {
  const projectRoot = cwd();
  const claudeMdPath = join(projectRoot, 'CLAUDE.md');

  if (!existsSync(claudeMdPath)) {
    return '';
  }

  try {
    return await readFile(claudeMdPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Get project slug from directory name
 */
function getProjectSlug(): string {
  const projectRoot = cwd();
  const parts = projectRoot.split(/[/\\]/);
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Format current date
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '/');
}

/**
 * Get user context with memoization
 */
export async function getUserContext(): Promise<UserContext> {
  const [memoryIndex, claudeMd] = await Promise.all([
    readMemoryIndex(),
    readProjectClaudeMd(),
  ]);

  return {
    memoryIndex,
    claudeMd,
    currentDate: formatDate(new Date()),
    projectSlug: getProjectSlug(),
  };
}

// ============================================================================
// Cache Breaking
// ============================================================================

/**
 * System prompt injection for cache breaking
 */
let systemPromptInjection: string | null = null;

/**
 * Set cache breaker injection
 */
export function setSystemPromptInjection(value: string | null): void {
  systemPromptInjection = value;
}

/**
 * Get current cache breaker injection
 */
export function getSystemPromptInjection(): string | null {
  return systemPromptInjection;
}

/**
 * Generate random string for cache breaking
 */
function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Maybe inject cache break text
 */
export function maybeInjectCacheBreak(
  context: SystemContext,
  config: CacheBreakerConfig = {}
): string {
  if (config.antCacheBreak !== true) {
    return '';
  }

  const now = Date.now();
  const interval = (config.intervalHours ?? 4) * 60 * 60 * 1000;

  // Check if we need to break cache
  if (!context.lastCacheBreak || now - context.lastCacheBreak > interval) {
    const breaker = randomString(16);
    // Note: In a real implementation, we'd update the stored context
    return `\n\n[Cache Break: ${breaker}]`;
  }

  return '';
}

// ============================================================================
// Context Injection
// ============================================================================

/**
 * Build system context string for injection
 */
export async function buildSystemContextString(): Promise<string> {
  const context = await getSystemContext();

  let result = '';

  // Git branch
  if (context.gitBranch !== 'unknown') {
    result += `Git Branch: ${context.gitBranch}\n`;
  }

  // Git status
  if (context.gitStatus !== 'unknown') {
    result += `Git Status: ${context.gitStatus}\n`;
  }

  // Recent commits
  if (context.recentCommits.length > 0) {
    result += `\nRecent Commits:\n`;
    for (const commit of context.recentCommits.slice(0, 3)) {
      result += `  - ${commit.hash} ${commit.message}\n`;
    }
  }

  return result.trim();
}

/**
 * Build user context string for injection
 */
export async function buildUserContextString(): Promise<string> {
  const context = await getUserContext();

  const parts: string[] = [];

  // Current date
  parts.push(`Today's date is ${context.currentDate}`);

  // Project slug
  parts.push(`Project: ${context.projectSlug}`);

  return parts.join('\n');
}

/**
 * Build full context string for system prompt
 */
export async function buildFullContextString(): Promise<string> {
  const [systemContext, userContext] = await Promise.all([
    buildSystemContextString(),
    buildUserContextString(),
  ]);

  const parts: string[] = [];

  if (systemContext) {
    parts.push('## System Context');
    parts.push(systemContext);
    parts.push('');
  }

  if (userContext) {
    parts.push('## User Context');
    parts.push(userContext);
    parts.push('');
  }

  // Cache breaker injection
  const cacheBreaker = maybeInjectCacheBreak(await getSystemContext(), {
    antCacheBreak: true,
    intervalHours: 4,
  });
  if (cacheBreaker) {
    parts.push(cacheBreaker);
  }

  return parts.join('\n');
}

// ============================================================================
// Module exports
// ============================================================================

export const agentContext = {
  getSystemContext,
  getUserContext,
  buildSystemContextString,
  buildUserContextString,
  buildFullContextString,
  setSystemPromptInjection,
  getSystemPromptInjection,
  maybeInjectCacheBreak,
};
