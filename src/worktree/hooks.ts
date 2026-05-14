/**
 * Worktree Hooks System
 *
 * Implements git worktree lifecycle hooks:
 * - WorktreeCreate hook event
 * - WorktreeRemove hook event
 * - Worktree tracking and management
 * - Hook invocation on worktree operations
 *
 * Reference: Claude Code's worktree hook events
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Worktree information
 */
export interface WorktreeInfo {
  /** Worktree path */
  path: string;
  /** Worktree name */
  name: string;
  /** Original branch */
  branch: string;
  /** Current HEAD */
  head?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last accessed timestamp */
  lastAccessed: number;
  /** Associated session ID */
  sessionId?: string;
  /** Custom properties */
  metadata?: Record<string, unknown>;
}

/**
 * Worktree creation event
 */
export interface WorktreeCreateEvent {
  /** Worktree path */
  path: string;
  /** Worktree name */
  name: string;
  /** Branch name */
  branch: string;
  /** Original branch (if creating from existing) */
  originalBranch?: string;
  /** Working directory */
  cwd?: string;
  /** Timestamp */
  timestamp: number;
  /** Session ID */
  sessionId?: string;
}

/**
 * Worktree removal event
 */
export interface WorktreeRemoveEvent {
  /** Worktree path */
  path: string;
  /** Worktree name */
  name: string;
  /** Reason for removal */
  reason?: 'user_request' | 'cleanup' | 'error';
  /** Working directory */
  cwd?: string;
  /** Timestamp */
  timestamp: number;
  /** Session ID */
  sessionId?: string;
}

/**
 * Worktree hook handler
 */
export type WorktreeHookHandler = (
  event: WorktreeCreateEvent | WorktreeRemoveEvent
) => Promise<void> | void;

// ============================================================================
// Worktree Registry
// ============================================================================

/**
 * Worktree Registry - tracks all worktrees
 */
export class WorktreeRegistry {
  private worktrees: Map<string, WorktreeInfo> = new Map();
  private createHandlers: WorktreeHookHandler[] = [];
  private removeHandlers: WorktreeHookHandler[] = [];
  private trackingEnabled = true;

  /**
   * Register a worktree
   */
  register(worktree: WorktreeInfo): void {
    this.worktrees.set(worktree.path, worktree);
    this.worktrees.set(worktree.name, worktree);
  }

  /**
   * Unregister a worktree
   */
  unregister(pathOrName: string): boolean {
    const worktree = this.worktrees.get(pathOrName);
    if (worktree) {
      this.worktrees.delete(worktree.path);
      this.worktrees.delete(worktree.name);
      return true;
    }
    return false;
  }

  /**
   * Get worktree by path or name
   */
  get(pathOrName: string): WorktreeInfo | undefined {
    return this.worktrees.get(pathOrName);
  }

  /**
   * Get all worktrees
   */
  getAll(): WorktreeInfo[] {
    // Return unique worktrees by path
    const seen = new Set<string>();
    const result: WorktreeInfo[] = [];

    for (const worktree of this.worktrees.values()) {
      if (!seen.has(worktree.path)) {
        seen.add(worktree.path);
        result.push(worktree);
      }
    }

    return result;
  }

  /**
   * Get worktree count
   */
  get count(): number {
    return this.getAll().length;
  }

  /**
   * Check if path is a registered worktree
   */
  isWorktree(path: string): boolean {
    for (const worktree of this.worktrees.values()) {
      if (worktree.path === path) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update worktree access time
   */
  touch(path: string): void {
    const worktree = this.worktrees.get(path);
    if (worktree) {
      worktree.lastAccessed = Date.now();
    }
  }

  /**
   * Update worktree metadata
   */
  updateMetadata(path: string, metadata: Record<string, unknown>): void {
    const worktree = this.worktrees.get(path);
    if (worktree) {
      worktree.metadata = { ...worktree.metadata, ...metadata };
    }
  }

  /**
   * Register worktree creation handler
   */
  onCreate(handler: WorktreeHookHandler): () => void {
    this.createHandlers.push(handler);
    return () => {
      const index = this.createHandlers.indexOf(handler);
      if (index !== -1) {
        this.createHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register worktree removal handler
   */
  onRemove(handler: WorktreeHookHandler): () => void {
    this.removeHandlers.push(handler);
    return () => {
      const index = this.removeHandlers.indexOf(handler);
      if (index !== -1) {
        this.removeHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Create worktree (with hooks)
   */
  async create(event: WorktreeCreateEvent): Promise<void> {
    const worktree: WorktreeInfo = {
      path: event.path,
      name: event.name,
      branch: event.branch,
      createdAt: event.timestamp,
      lastAccessed: event.timestamp,
      sessionId: event.sessionId,
    };

    this.register(worktree);

    // Invoke create handlers
    for (const handler of this.createHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Worktree create hook error:', error);
      }
    }
  }

  /**
   * Remove worktree (with hooks)
   */
  async remove(event: WorktreeRemoveEvent): Promise<void> {
    this.unregister(event.path);

    // Invoke remove handlers
    for (const handler of this.removeHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Worktree remove hook error:', error);
      }
    }
  }

  /**
   * Enable/disable tracking
   */
  setTracking(enabled: boolean): void {
    this.trackingEnabled = enabled;
  }

  /**
   * Check if tracking is enabled
   */
  isTracking(): boolean {
    return this.trackingEnabled;
  }

  /**
   * Clear all worktrees and handlers
   */
  clear(): void {
    this.worktrees.clear();
    this.createHandlers = [];
    this.removeHandlers = [];
  }

  /**
   * Export worktrees to JSON
   */
  export(): WorktreeInfo[] {
    return this.getAll();
  }

  /**
   * Import worktrees from JSON
   */
  import(worktrees: WorktreeInfo[]): void {
    for (const worktree of worktrees) {
      this.worktrees.set(worktree.path, worktree);
      this.worktrees.set(worktree.name, worktree);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalWorktrees: number;
    createHandlers: number;
    removeHandlers: number;
    trackingEnabled: boolean;
  } {
    return {
      totalWorktrees: this.count,
      createHandlers: this.createHandlers.length,
      removeHandlers: this.removeHandlers.length,
      trackingEnabled: this.trackingEnabled,
    };
  }
}

// ============================================================================
// Global Registry Instance
// ============================================================================

let globalRegistry: WorktreeRegistry | null = null;

export function getWorktreeRegistry(): WorktreeRegistry {
  if (!globalRegistry) {
    globalRegistry = new WorktreeRegistry();
  }
  return globalRegistry;
}

export function resetWorktreeRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clear();
    globalRegistry = null;
  }
}

// ============================================================================
// Worktree File Operations
// ============================================================================

/**
 * Worktree storage file path
 */
export function getWorktreeStoragePath(): string {
  const { globalUpupPath } = require('../utils/storage-paths.js');
  return globalUpupPath('data', 'worktrees.json');
}

/**
 * Save worktrees to file
 */
export async function saveWorktrees(registry: WorktreeRegistry): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  const storagePath = getWorktreeStoragePath();
  const dir = path.dirname(storagePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data = registry.export();
  fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Load worktrees from file
 */
export async function loadWorktrees(registry: WorktreeRegistry): Promise<void> {
  const fs = await import('fs');

  const storagePath = getWorktreeStoragePath();

  if (!fs.existsSync(storagePath)) {
    return;
  }

  try {
    const content = fs.readFileSync(storagePath, 'utf-8');
    const data = JSON.parse(content);

    if (Array.isArray(data)) {
      registry.import(data);
    }
  } catch (error) {
    console.error('Failed to load worktrees:', error);
  }
}

// ============================================================================
// Worktree Discovery
// ============================================================================

/**
 * Discover worktrees from git config
 */
export async function discoverWorktreesFromGit(
  cwd: string
): Promise<WorktreeInfo[]> {
  const { execSync } = await import('child_process');
  const worktrees: WorktreeInfo[] = [];

  try {
    const output = execSync('git worktree list --porcelain', {
      cwd,
      encoding: 'utf-8',
    });

    let currentWorktree: Partial<WorktreeInfo> = {};
    let currentPath = '';

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice(9);
        currentWorktree = {
          path: currentPath,
          name: currentPath.split('/').pop() || currentPath,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
        };
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.slice(7);
      } else if (line === '' && currentPath) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as WorktreeInfo);
        }
        currentWorktree = {};
        currentPath = '';
      }
    }
  } catch {
    // Not a git repo or git worktree not available
  }

  return worktrees;
}

// ============================================================================
// Hook Integration with HookRegistry
// ============================================================================

import { getHookRegistry, type HookContext } from '../plugins/hook-events.js';

/**
 * Register worktree hooks with the global hook registry
 */
export function registerWorktreeHooks(): void {
  const hookRegistry = getHookRegistry();
  const worktreeRegistry = getWorktreeRegistry();

  // WorktreeCreate hook
  hookRegistry.register({
    event: 'WorktreeCreate',
    handler: async (context: HookContext) => {
      const ctx = context as any;
      await worktreeRegistry.create({
        path: ctx.worktreePath,
        name: ctx.worktreeName,
        branch: ctx.originalBranch || 'unknown',
        originalBranch: ctx.originalBranch,
        cwd: ctx.cwd,
        timestamp: ctx.timestamp,
        sessionId: ctx.sessionId,
      });
    },
    pluginName: 'worktree-system',
    priority: 100, // Run early
  });

  // WorktreeRemove hook
  hookRegistry.register({
    event: 'WorktreeRemove',
    handler: async (context: HookContext) => {
      const ctx = context as any;
      await worktreeRegistry.remove({
        path: ctx.worktreePath,
        name: ctx.worktreeName,
        cwd: ctx.cwd,
        timestamp: ctx.timestamp,
        sessionId: ctx.sessionId,
      });
    },
    pluginName: 'worktree-system',
    priority: 100,
  });
}
