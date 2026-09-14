/**
 * Stop Hooks - Claude Code-style hooks for turn/stop events
 *
 * Features:
 * - StopHookRegistry: Central registry for all stop hooks
 * - Priority-based execution
 * - Async fire-and-forget execution
 *
 * Reference: Loucode's services/extractMemories and hooks system
 */

import { warn, error, info, debug } from '../utils/logging/logger.js';
import type { Message } from '@earendil-works/pi-ai';

// ============================================================================
// Stop Hook Types
// ============================================================================

/**
 * Stop hook context - information available when hook executes
 */
export interface StopHookContext {
  /** All messages in current conversation */
  messages: Message[];
  /** Session ID for this conversation */
  sessionId: string;
  /** Turn count within session */
  turnCount: number;
  /** Working directory */
  cwd: string;
  /** Timestamp when hook was triggered */
  timestamp: number;
}

/**
 * Stop hook definition
 */
export interface StopHook {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Execution priority (lower = earlier, default 100) */
  priority: number;
  /** Whether hook is enabled */
  enabled?: boolean;
  /** Optional description */
  description?: string;
  /** Execute the hook */
  execute: (context: StopHookContext) => Promise<void>;
}

/**
 * Stop hook result
 */
export interface StopHookResult {
  /** Whether execution was successful */
  success: boolean;
  /** Hook ID that executed */
  hookId: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  duration?: number;
}

// ============================================================================
// Stop Hook Registry
// ============================================================================

/**
 * Central registry for all stop hooks
 *
 * Provides:
 * - Registration/unregistration of hooks
 * - Priority-sorted execution
 * - Error isolation (one hook failure doesn't affect others)
 */
export class StopHookRegistry {
  private hooks: Map<string, StopHook> = new Map();
  private executionCount: Map<string, number> = new Map();
  private lastExecution: Map<string, number> = new Map();

  /**
   * Register a stop hook
   */
  register(hook: StopHook): void {
    if (this.hooks.has(hook.id)) {
      warn('hooks', `Stop hook ${hook.id} already registered, replacing`);
    }
    this.hooks.set(hook.id, hook);
    this.executionCount.set(hook.id, 0);
    info('hooks', `Registered stop hook: ${hook.name} (${hook.id})`);
  }

  /**
   * Unregister a stop hook by ID
   */
  unregister(id: string): boolean {
    const removed = this.hooks.delete(id);
    if (removed) {
      info('hooks', `Unregistered stop hook: ${id}`);
    }
    return removed;
  }

  /**
   * Get a hook by ID
   */
  get(id: string): StopHook | undefined {
    return this.hooks.get(id);
  }

  /**
   * Get all registered hooks
   */
  getAll(): StopHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Check if a hook is registered
   */
  has(id: string): boolean {
    return this.hooks.has(id);
  }

  /**
   * Enable a hook
   */
  enable(id: string): void {
    const hook = this.hooks.get(id);
    if (hook) {
      hook.enabled = true;
      debug('hooks', `Enabled stop hook: ${id}`);
    }
  }

  /**
   * Disable a hook
   */
  disable(id: string): void {
    const hook = this.hooks.get(id);
    if (hook) {
      hook.enabled = false;
      debug('hooks', `Disabled stop hook: ${id}`);
    }
  }

  /**
   * Get hooks sorted by priority
   */
  private getSortedHooks(): StopHook[] {
    return Array.from(this.hooks.values())
      .filter(h => h.enabled !== false) // Default to enabled
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute all registered hooks
   *
   * Returns immediately after firing hooks (fire-and-forget).
   * Errors are caught and logged, but don't propagate.
   */
  executeAll(context: StopHookContext): void {
    const hooks = this.getSortedHooks();

    if (hooks.length === 0) {
      debug('hooks', 'No stop hooks registered, skipping execution');
      return;
    }

    info('hooks', `Executing ${hooks.length} stop hooks`);

    // Execute all hooks in background (fire and forget)
    for (const hook of hooks) {
      this.executeHookAsync(hook, context).catch(err => {
        warn('hooks', `Stop hook ${hook.id} failed: ${err}`);
      });
    }
  }

  /**
   * Execute all hooks and wait for completion
   *
   * Use this when you need to wait for hooks to complete
   */
  async executeAllAndWait(context: StopHookContext): Promise<StopHookResult[]> {
    const hooks = this.getSortedHooks();

    if (hooks.length === 0) {
      debug('hooks', 'No stop hooks registered, skipping execution');
      return [];
    }

    info('hooks', `Executing ${hooks.length} stop hooks (sync)`);
    const results: StopHookResult[] = [];

    for (const hook of hooks) {
      const result = await this.executeHookAsync(hook, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single hook asynchronously
   */
  private async executeHookAsync(
    hook: StopHook,
    context: StopHookContext
  ): Promise<StopHookResult> {
    const startTime = Date.now();

    try {
      await hook.execute(context);

      const duration = Date.now() - startTime;
      const count = (this.executionCount.get(hook.id) ?? 0) + 1;
      this.executionCount.set(hook.id, count);
      this.lastExecution.set(hook.id, Date.now());

      debug('hooks', `Stop hook ${hook.id} executed in ${duration}ms`);

      return {
        success: true,
        hookId: hook.id,
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      warn('hooks', `Stop hook ${hook.id} failed after ${duration}ms: ${errorMessage}`);

      return {
        success: false,
        hookId: hook.id,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): Map<string, { executions: number; lastExecution: number | undefined }> {
    const stats = new Map<string, { executions: number; lastExecution: number | undefined }>();

    for (const [id, count] of this.executionCount) {
      stats.set(id, {
        executions: count,
        lastExecution: this.lastExecution.get(id),
      });
    }

    return stats;
  }

  /**
   * Reset execution counts
   */
  resetStats(): void {
    for (const id of this.hooks.keys()) {
      this.executionCount.set(id, 0);
    }
    info('hooks', 'Reset stop hook execution stats');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let registry: StopHookRegistry | null = null;

/**
 * Get the global StopHookRegistry instance
 */
export function getStopHookRegistry(): StopHookRegistry {
  if (!registry) {
    registry = new StopHookRegistry();
  }
  return registry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetStopHookRegistry(): void {
  registry = null;
}

// ============================================================================
// Built-in Stop Hooks
// ============================================================================

/**
 * Create a memory extraction stop hook
 *
 * Triggers memory extraction after a turn completes
 */
export function createMemoryExtractionHook(): StopHook {
  return {
    id: 'memory-extraction-stop',
    name: 'Memory Extraction Stop Hook',
    description: 'Extracts memories from conversation after turn completes',
    priority: 100,
    enabled: true,
    execute: async (context) => {
      // Lazy import to avoid circular dependencies
      try {
        const { getObservationBuffer } = await import('@upup/memory');
        const { extractMemories } = await import('@upup/memory');

        const obsBuffer = getObservationBuffer();

        if (obsBuffer.shouldExtract(5)) {
          // Extract from accumulated observations
          const obsMessages = obsBuffer.toMessages();
          obsBuffer.clear();

          if (obsMessages.length > 0) {
            const results = await extractMemories(obsMessages);
            info('memory', `Extracted ${results.length} memories from ${obsMessages.length} observations`);
          }
        } else {
          // Fallback: extract from conversation messages
          const messageData = context.messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          }));

          // Only extract if we have enough messages
          if (messageData.length >= 3) {
            const results = await extractMemories(messageData);
            if (results.length > 0) {
              info('memory', `Extracted ${results.length} memories from conversation`);
            }
          }
        }
      } catch (err) {
        // Memory module not available - this is expected in some contexts
        debug('memory', `Memory extraction skipped: ${err}`);
      }
    },
  };
}

/**
 * Create a session memory update stop hook
 *
 * Updates session memory with recent conversation
 */
export function createSessionMemoryHook(): StopHook {
  return {
    id: 'session-memory-stop',
    name: 'Session Memory Stop Hook',
    description: 'Updates session memory with recent conversation',
    priority: 80,
    enabled: true,
    execute: async (context) => {
      try {
        const { shouldUpdateSessionMemory, updateSessionMemory } = await import('@upup/memory');
        const config = await import('@upup/memory');

        if (shouldUpdateSessionMemory()) {
          const result = await updateSessionMemory(context.messages);
          info('memory', `Session memory updated: ${result.tokenCount} tokens`);
        }
      } catch (err) {
        debug('memory', `Session memory update skipped: ${err}`);
      }
    },
  };
}

/**
 * Create an observation buffer clear hook
 *
 * Clears the observation buffer after turn completes
 */
export function createObservationBufferClearHook(): StopHook {
  return {
    id: 'observation-buffer-clear',
    name: 'Observation Buffer Clear Hook',
    description: 'Clears observation buffer after turn',
    priority: 200, // Run late
    enabled: true,
    execute: async (context) => {
      try {
        const { getObservationBuffer } = await import('@upup/memory');
        const buffer = getObservationBuffer();

        // Only clear if extraction already happened
        // This hook just ensures cleanup
        debug('memory', `Observation buffer has ${buffer.size()} observations`);
      } catch {
        // Buffer not available
      }
    },
  };
}

// ============================================================================
// Default Hook Registration
// ============================================================================

let defaultsRegistered = false;

/**
 * Register all default stop hooks
 */
export function registerDefaultStopHooks(): void {
  if (defaultsRegistered) {
    return;
  }

  const reg = getStopHookRegistry();

  // Memory extraction hook
  reg.register(createMemoryExtractionHook());

  // Session memory hook
  reg.register(createSessionMemoryHook());

  // Observation buffer clear hook
  reg.register(createObservationBufferClearHook());

  defaultsRegistered = true;
  info('hooks', 'Registered default stop hooks');
}
