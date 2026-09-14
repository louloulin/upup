/**
 * Shell Snapshots System
 *
 * Implements shell state capture and restoration:
 * - Capture shell environment, aliases, functions
 * - Save as shell script for restoration
 * - Store in ~/.upup/shell-snapshots/
 *
 * Reference: Claude Code's src/utils/bash/ShellSnapshot.ts
 */

import { globalUpupPath } from '@upup/utils';
import { generateId } from './crypto-utils.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

/**
 * Shell type
 */
export type ShellType = 'bash' | 'zsh' | 'fish' | 'sh';

/**
 * Shell snapshot info
 */
export interface ShellSnapshotInfo {
  /** Snapshot ID */
  id: string;
  /** Shell type */
  shellType: ShellType;
  /** Timestamp */
  timestamp: number;
  /** Snapshot file path */
  path: string;
  /** Size in bytes */
  size: number;
}

/**
 * Shell environment snapshot
 */
export interface ShellEnvironment {
  /** Environment variables */
  env: Record<string, string>;
  /** Current working directory */
  cwd: string;
  /** PATH */
  path: string;
}

/**
 * Shell alias
 */
export interface ShellAlias {
  name: string;
  command: string;
}

/**
 * Shell function
 */
export interface ShellFunction {
  name: string;
  definition: string;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get shell snapshots directory
 */
export function getShellSnapshotsDir(): string {
  return globalUpupPath('shell-snapshots');
}

/**
 * Generate snapshot filename
 */
function generateSnapshotFilename(shellType: ShellType, timestamp: number): string {
  const id = generateId().slice(0, 8);
  return `snapshot-${shellType}-${timestamp}-${id}.sh`;
}

/**
 * Get snapshot path
 */
function getSnapshotPath(shellType: ShellType): string {
  const dir = getShellSnapshotsDir();
  const filename = generateSnapshotFilename(shellType, Date.now());
  return `${dir}/${filename}`;
}

// ============================================================================
// Shell Snapshot Generator
// ============================================================================

/**
 * Get shell configuration files
 */
function getShellConfigFiles(shellType: ShellType): string[] {
  const home = os.homedir();

  switch (shellType) {
    case 'bash':
      return [
        `${home}/.bashrc`,
        `${home}/.bash_profile`,
        `${home}/.bash_aliases`,
      ];
    case 'zsh':
      return [
        `${home}/.zshrc`,
        `${home}/.zprofile`,
        `${home}/.zshenv`,
      ];
    case 'fish':
      return [
        `${home}/.config/fish/config.fish`,
      ];
    case 'sh':
      return [
        `${home}/.profile`,
      ];
    default:
      return [];
  }
}

/**
 * Detect current shell type
 */
export function detectShellType(): ShellType {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('bash')) return 'bash';
  return 'sh';
}

/**
 * Generate shell snapshot script
 */
export function generateSnapshotScript(
  shellType: ShellType,
  environment: ShellEnvironment,
  aliases: ShellAlias[],
  functions: ShellFunction[]
): string {
  const lines: string[] = [];

  // Header
  lines.push('#!/bin/bash');
  lines.push('# -*- mode: shell-script -*-');
  lines.push(`# Shell Snapshot - Generated: ' + new Date().toISOString() + '`);
  lines.push(`# Shell Type: ${shellType}`);
  lines.push('');
  lines.push('# Set working directory');
  lines.push(`cd "${environment.cwd}"`);
  lines.push('');

  // Environment variables
  lines.push('# Environment variables');
  for (const [key, value] of Object.entries(environment.env)) {
    // Skip sensitive variables
    if (key === 'PASSWORD' || key === 'SECRET' || key === 'TOKEN') {
      continue;
    }
    lines.push(`export ${key}='${value.replace(/'/g, "'\\''")}'`);
  }
  lines.push('');

  // Aliases
  if (aliases.length > 0) {
    lines.push('# Aliases');
    for (const alias of aliases) {
      lines.push(`alias ${alias.name}='${alias.command.replace(/'/g, "'\\''")}'`);
    }
    lines.push('');
  }

  // Functions
  if (functions.length > 0) {
    lines.push('# Functions');
    for (const fn of functions) {
      lines.push(fn.definition);
    }
    lines.push('');
  }

  lines.push('# Snapshot complete');
  lines.push('');

  return lines.join('\n');
}

/**
 * Capture current shell environment
 */
function captureShellEnvironment(): ShellEnvironment {
  const { env } = process;

  // Build PATH from current PATH
  const path = env.PATH || '';

  // Filter out sensitive environment variables
  const filteredEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value && !key.includes('SECRET') && !key.includes('PASSWORD') && !key.includes('TOKEN')) {
      filteredEnv[key] = value;
    }
  }

  return {
    env: filteredEnv,
    cwd: process.cwd(),
    path,
  };
}

// ============================================================================
// Shell Snapshot Manager
// ============================================================================

/**
 * Shell Snapshot Manager
 */
export class ShellSnapshotManager {
  private snapshots: Map<string, ShellSnapshotInfo> = new Map();
  private snapshotDir: string;

  constructor() {
    this.snapshotDir = getShellSnapshotsDir();
    this.ensureSnapshotDir();
  }

  /**
   * Ensure snapshot directory exists
   */
  private ensureSnapshotDir(): void {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  /**
   * Detect shell type
   */
  detectShell(): ShellType {
    return detectShellType();
  }

  /**
   * Create a snapshot of current shell state
   */
  createSnapshot(
    shellType?: ShellType,
    environment?: ShellEnvironment,
    aliases?: ShellAlias[],
    functions?: ShellFunction[]
  ): ShellSnapshotInfo {
    const type = shellType || this.detectShell();
    const env = environment || captureShellEnvironment();
    const aliasList = aliases || [];
    const funcList = functions || [];

    // Generate snapshot script
    const script = generateSnapshotScript(type, env, aliasList, funcList);

    // Get path and save
    const timestamp = Date.now();
    const id = generateId().slice(0, 8);
    const filename = `snapshot-${type}-${timestamp}-${id}.sh`;
    const snapshotPath = `${this.snapshotDir}/${filename}`;

    fs.writeFileSync(snapshotPath, script, 'utf-8');
    fs.chmodSync(snapshotPath, 0o755);

    const stats = fs.statSync(snapshotPath);

    const info: ShellSnapshotInfo = {
      id,
      shellType: type,
      timestamp,
      path: snapshotPath,
      size: stats.size,
    };

    this.snapshots.set(id, info);
    return info;
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(id: string): ShellSnapshotInfo | null {
    return this.snapshots.get(id) ?? null;
  }

  /**
   * Get all snapshots
   */
  getAllSnapshots(): ShellSnapshotInfo[] {
    return [...this.snapshots.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get latest snapshot
   */
  getLatestSnapshot(): ShellSnapshotInfo | null {
    const snapshots = this.getAllSnapshots();
    return snapshots[0] ?? null;
  }

  /**
   * Load snapshot script content
   */
  getSnapshotScript(id: string): string | null {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      return null;
    }

    if (!fs.existsSync(snapshot.path)) {
      return null;
    }

    return fs.readFileSync(snapshot.path, 'utf-8');
  }

  /**
   * Apply a snapshot (execute its script)
   */
  async applySnapshot(id: string): Promise<boolean> {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      return false;
    }

    const { execSync } = await import('child_process');

    try {
      execSync(`bash "${snapshot.path}"`, {
        stdio: 'inherit',
        shell: '/bin/bash',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(id: string): boolean {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      return false;
    }

    if (fs.existsSync(snapshot.path)) {
      fs.unlinkSync(snapshot.path);
    }

    this.snapshots.delete(id);
    return true;
  }

  /**
   * Clear all snapshots
   */
  clearAll(): void {
    if (fs.existsSync(this.snapshotDir)) {
      const files = fs.readdirSync(this.snapshotDir);
      for (const file of files) {
        if (file.startsWith('snapshot-')) {
          fs.unlinkSync(`${this.snapshotDir}/${file}`);
        }
      }
    }

    this.snapshots.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    snapshotCount: number;
    totalSize: number;
    oldestSnapshot: number | null;
    newestSnapshot: number | null;
  } {
    let totalSize = 0;

    if (fs.existsSync(this.snapshotDir)) {
      const files = fs.readdirSync(this.snapshotDir).filter(f => f.startsWith('snapshot-'));
      for (const file of files) {
        const stats = fs.statSync(`${this.snapshotDir}/${file}`);
        totalSize += stats.size;
      }
    }

    const snapshots = this.getAllSnapshots();
    const timestamps = snapshots.map(s => s.timestamp);

    return {
      snapshotCount: snapshots.length,
      totalSize,
      oldestSnapshot: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestSnapshot: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalManager: ShellSnapshotManager | null = null;

export function getShellSnapshotManager(): ShellSnapshotManager {
  if (!globalManager) {
    globalManager = new ShellSnapshotManager();
  }
  return globalManager;
}

export function resetShellSnapshotManager(): void {
  globalManager = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a snapshot of current shell state
 */
export function createShellSnapshot(): ShellSnapshotInfo {
  const manager = getShellSnapshotManager();
  return manager.createSnapshot();
}

/**
 * List all shell snapshots
 */
export function listShellSnapshots(): ShellSnapshotInfo[] {
  const manager = getShellSnapshotManager();
  return manager.getAllSnapshots();
}

/**
 * Restore shell state from snapshot
 */
export async function restoreShellSnapshot(id: string): Promise<boolean> {
  const manager = getShellSnapshotManager();
  return manager.applySnapshot(id);
}