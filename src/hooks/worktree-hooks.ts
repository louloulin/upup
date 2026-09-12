/**
 * Worktree Hooks - Hook events for WorktreeCreate, WorktreeRemove
 *
 * Provides hooks for:
 * - WorktreeCreate: When a new git worktree is created
 * - WorktreeRemove: When a git worktree is removed
 *
 * Reference: Loucode's HOOK_EVENTS system
 */

import { info, warn, debug } from '../utils/logging/logger.js';

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Worktree hook event types
 */
export type WorktreeHookEvent = 'WorktreeCreate' | 'WorktreeRemove' | 'WorktreeEnter' | 'WorktreeExit';

/**
 * Worktree hook context
 */
export interface WorktreeHookContext {
  /** Worktree path */
  path: string;
  /** Worktree branch */
  branch: string;
  /** Session ID */
  sessionId: string;
  /** Working directory */
  cwd: string;
  /** Trigger timestamp */
  timestamp: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Worktree hook result
 */
export interface WorktreeHookResult {
  /** Continue after hook */
  continue: boolean;
  /** Suppress output */
  suppressOutput?: boolean;
  /** Warning message */
  warning?: string;
  /** Error message */
  error?: string;
}

/**
 * Worktree hook definition
 */
export interface WorktreeHook {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Event type */
  event: WorktreeHookEvent;
  /** Whether hook is enabled */
  enabled?: boolean;
  /** Priority (lower = earlier) */
  priority?: number;
  /** Execute the hook */
  execute: (context: WorktreeHookContext) => Promise<WorktreeHookResult>;
}

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * Worktree Hook Registry - Central registry for worktree hooks
 */
export class WorktreeHookRegistry {
  private hooks: Map<string, WorktreeHook> = new Map();
  private events: Map<WorktreeHookEvent, string[]> = new Map();

  /**
   * Register a worktree hook
   */
  register(hook: WorktreeHook): void {
    const id = hook.id || `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.hooks.set(id, { ...hook, id });

    // Register for event
    if (!this.events.has(hook.event)) {
      this.events.set(hook.event, []);
    }
    this.events.get(hook.event)!.push(id);

    // Sort by priority
    this.sortEventHooks(hook.event);

    debug('worktree-hooks', `Registered worktree hook: ${hook.name} for ${hook.event}`);
  }

  /**
   * Unregister a hook
   */
  unregister(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) {
      return false;
    }

    // Remove from event list
    const eventHooks = this.events.get(hook.event);
    if (eventHooks) {
      this.events.set(
        hook.event,
        eventHooks.filter((id) => id !== hookId)
      );
    }

    this.hooks.delete(hookId);
    return true;
  }

  /**
   * Fire a worktree hook
   */
  async fire(event: WorktreeHookEvent, context: WorktreeHookContext): Promise<WorktreeHookResult[]> {
    const hookIds = this.events.get(event) || [];
    const results: WorktreeHookResult[] = [];

    for (const hookId of hookIds) {
      const hook = this.hooks.get(hookId);
      if (!hook || hook.enabled === false) {
        continue;
      }

      try {
        const result = await hook.execute(context);
        results.push(result);

        if (!result.continue) {
          warn('worktree-hooks', `Hook ${hook.name} blocked ${event}`);
          break;
        }
      } catch (err) {
        warn('worktree-hooks', `Hook ${hook.name} failed: ${err}`);
        results.push({ continue: true, error: String(err) });
      }
    }

    return results;
  }

  /**
   * Fire WorktreeCreate hook
   */
  async fireWorktreeCreate(context: WorktreeHookContext): Promise<WorktreeHookResult[]> {
    info('worktree-hooks', `Firing WorktreeCreate hook for ${context.path}`);
    return this.fire('WorktreeCreate', context);
  }

  /**
   * Fire WorktreeRemove hook
   */
  async fireWorktreeRemove(context: WorktreeHookContext): Promise<WorktreeHookResult[]> {
    info('worktree-hooks', `Firing WorktreeRemove hook for ${context.path}`);
    return this.fire('WorktreeRemove', context);
  }

  /**
   * Fire WorktreeEnter hook
   */
  async fireWorktreeEnter(context: WorktreeHookContext): Promise<WorktreeHookResult[]> {
    return this.fire('WorktreeEnter', context);
  }

  /**
   * Fire WorktreeExit hook
   */
  async fireWorktreeExit(context: WorktreeHookContext): Promise<WorktreeHookResult[]> {
    return this.fire('WorktreeExit', context);
  }

  /**
   * Get all registered hooks
   */
  getAllHooks(): WorktreeHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get hooks for an event
   */
  getHooksForEvent(event: WorktreeHookEvent): WorktreeHook[] {
    const hookIds = this.events.get(event) || [];
    return hookIds.map((id) => this.hooks.get(id)).filter(Boolean) as WorktreeHook[];
  }

  private sortEventHooks(event: WorktreeHookEvent): void {
    const hookIds = this.events.get(event) || [];
    hookIds.sort((a, b) => {
      const hookA = this.hooks.get(a);
      const hookB = this.hooks.get(b);
      return (hookA?.priority || 100) - (hookB?.priority || 100);
    });
  }
}

// ============================================================================
// Default Hooks
// ============================================================================

/**
 * Create default git protection hook
 */
export function createGitProtectionHook(): WorktreeHook {
  return {
    id: 'git-protection',
    name: 'Git Protection Hook',
    event: 'WorktreeRemove',
    priority: 50,
    async execute(context): Promise<WorktreeHookResult> {
      // Check for uncommitted changes
      try {
        const { execSync } = require('child_process');
        const output = execSync('git status --porcelain', {
          cwd: context.path,
          encoding: 'utf-8',
        });

        if (output.trim()) {
          warn('worktree-hooks', `Worktree ${context.path} has uncommitted changes`);
          return {
            continue: true,
            warning: `Worktree has uncommitted changes: ${output.trim()}`,
          };
        }
      } catch {
        // git command failed, ignore
      }

      return { continue: true };
    },
  };
}

/**
 * Create session cleanup hook
 */
export function createSessionCleanupHook(): WorktreeHook {
  return {
    id: 'session-cleanup',
    name: 'Session Cleanup Hook',
    event: 'WorktreeRemove',
    priority: 90,
    async execute(context): Promise<WorktreeHookResult> {
      // Clean up session files in worktree
      try {
        const { execSync } = require('child_process');
        const sessionFiles = execSync(
          `find "${context.path}" -name "*.session" -o -name ".upup" -type d 2>/dev/null | head -10`,
          { encoding: 'utf-8' }
        );

        if (sessionFiles.trim()) {
          info('worktree-hooks', `Found session files to clean: ${sessionFiles.trim()}`);
        }
      } catch {
        // ignore
      }

      return { continue: true };
    },
  };
}

// ============================================================================
// Singleton Registry
// ============================================================================

let registryInstance: WorktreeHookRegistry | null = null;

export function getWorktreeHookRegistry(): WorktreeHookRegistry {
  if (!registryInstance) {
    registryInstance = new WorktreeHookRegistry();
    // Register default hooks
    registryInstance.register(createGitProtectionHook());
    registryInstance.register(createSessionCleanupHook());
  }
  return registryInstance;
}

export function resetWorktreeHookRegistry(): void {
  registryInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register a worktree hook
 */
export function registerWorktreeHook(hook: WorktreeHook): void {
  getWorktreeHookRegistry().register(hook);
}

/**
 * Unregister a worktree hook
 */
export function unregisterWorktreeHook(hookId: string): boolean {
  return getWorktreeHookRegistry().unregister(hookId);
}

/**
 * Emit worktree created event
 */
export async function emitWorktreeCreated(
  path: string,
  branch: string,
  sessionId: string
): Promise<WorktreeHookResult[]> {
  return getWorktreeHookRegistry().fireWorktreeCreate({
    path,
    branch,
    sessionId,
    cwd: path,
    timestamp: Date.now(),
  });
}

/**
 * Emit worktree removed event
 */
export async function emitWorktreeRemoved(
  path: string,
  branch: string,
  sessionId: string
): Promise<WorktreeHookResult[]> {
  return getWorktreeHookRegistry().fireWorktreeRemove({
    path,
    branch,
    sessionId,
    cwd: path,
    timestamp: Date.now(),
  });
}
