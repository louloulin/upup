/**
 * Tool Hooks - Claude Code-style hooks for tool execution
 *
 * Features:
 * - PreToolUse: Before tool execution
 * - PostToolUse: After tool success
 * - PostToolUseFailure: After tool failure
 * - Stop: At turn end
 * - SessionStart/SessionEnd: Session lifecycle
 *
 * Reference: Loucode's types/hooks.ts and utils/hooks.ts
 */

import { info, warn, error } from '../utils/logging/logger.js';

// ============================================================================
// Hook Event Types
// ============================================================================

/**
 * All supported hook events
 */
export type HookEvent =
  // Tool lifecycle hooks
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  // Turn hooks
  | 'Stop'
  | 'StopFailure'
  | 'UserPromptSubmit'
  // Session hooks
  | 'SessionStart'
  | 'SessionEnd'
  | 'Setup'
  // Subagent hooks
  | 'SubagentStart'
  | 'SubagentStop'
  // Task hooks
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'TeammateIdle'
  // Permission hooks
  | 'PermissionRequest'
  | 'PermissionDenied'
  // Context hooks
  | 'PreCompact'
  | 'PostCompact'
  // System hooks
  | 'CwdChanged'
  | 'FileChanged'
  | 'ConfigChange'
  | 'Notification';

/**
 * Hook types
 */
export type HookType = 'command' | 'function' | 'http' | 'prompt';

/**
 * Hook output schema (from Loucode)
 */
export interface HookOutput {
  /** Continue after hook */
  continue?: boolean;
  /** Hide stdout */
  suppressOutput?: boolean;
  /** Stop message */
  stopReason?: string;
  /** Permission decision */
  decision?: 'approve' | 'block' | 'allow' | 'deny' | 'ask';
  /** Decision reason */
  reason?: string;
  /** Warning message */
  systemMessage?: string;
  /** Event-specific output */
  hookSpecificOutput?: HookSpecificOutput;
}

export interface HookSpecificOutput {
  hookEventName: HookEvent;
  permissionDecision?: 'allow' | 'deny' | 'ask';
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
}

/**
 * Hook context
 */
export interface HookContext {
  sessionId: string;
  turnCount: number;
  cwd: string;
  timestamp: number;
  [key: string]: unknown;
}

// ============================================================================
// Hook Definition
// ============================================================================

export interface HookDefinition {
  id: string;
  name: string;
  event: HookEvent;
  type: HookType;
  /** Handler function */
  handler: HookHandler;
  /** Is hook enabled */
  enabled?: boolean;
  /** Execution priority (lower = earlier) */
  priority?: number;
  /** Optional description */
  description?: string;
}

export type HookHandler = (
  params: unknown,
  context: HookContext
) => Promise<HookOutput | void>;

// ============================================================================
// Hook Event Parameters
// ============================================================================

export interface PreToolUseParams {
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string;
}

export interface PostToolUseParams {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  duration?: number;
  toolCallId?: string;
}

export interface PostToolUseFailureParams {
  toolName: string;
  args: Record<string, unknown>;
  error: string;
  toolCallId?: string;
}

export interface StopParams {
  stopReason: string;
  messages: unknown[];
}

export interface SessionStartParams {
  projectSlug: string;
  model: string;
}

export interface SessionEndParams {
  projectSlug: string;
  duration: number;
}

export interface TaskCreatedParams {
  taskId: string;
  description: string;
}

export interface TaskCompletedParams {
  taskId: string;
  success: boolean;
}

export interface PermissionRequestParams {
  toolName: string;
  args: Record<string, unknown>;
  reason?: string;
}

export interface CompactParams {
  messages: unknown[];
  tokenCount: number;
}

// ============================================================================
// Hook Executor
// ============================================================================

export class ToolHookExecutor {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map();
  private globalContext: Partial<HookContext> = {};

  constructor() {
    // Initialize hook arrays for all event types
    const events: HookEvent[] = [
      'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
      'Stop', 'StopFailure', 'UserPromptSubmit',
      'SessionStart', 'SessionEnd', 'Setup',
      'SubagentStart', 'SubagentStop',
      'TaskCreated', 'TaskCompleted', 'TeammateIdle',
      'PermissionRequest', 'PermissionDenied',
      'PreCompact', 'PostCompact',
      'CwdChanged', 'FileChanged', 'ConfigChange', 'Notification',
    ];

    for (const event of events) {
      this.hooks.set(event, []);
    }
  }

  /**
   * Set global context for all hooks
   */
  setGlobalContext(context: Partial<HookContext>): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Register a hook
   */
  register(hook: HookDefinition): void {
    const hooks = this.hooks.get(hook.event) ?? [];
    hooks.push(hook);
    hooks.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    this.hooks.set(hook.event, hooks);
    info('system', `Registered hook: ${hook.name} for ${hook.event}`);
  }

  /**
   * Unregister a hook by ID
   */
  unregister(id: string): boolean {
    for (const [event, hooks] of this.hooks) {
      const index = hooks.findIndex(h => h.id === id);
      if (index !== -1) {
        hooks.splice(index, 1);
        info('system', `Unregistered hook: ${id}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get hooks for an event
   */
  getHooks(event: HookEvent): HookDefinition[] {
    return this.hooks.get(event) ?? [];
  }

  /**
   * Execute hooks for an event
   */
  async executeHooks<T>(
    event: HookEvent,
    params: T,
    additionalContext?: Partial<HookContext>
  ): Promise<HookOutput> {
    const hooks = this.getHooks(event);
    const context: HookContext = {
      sessionId: this.globalContext.sessionId ?? 'unknown',
      turnCount: this.globalContext.turnCount ?? 0,
      cwd: this.globalContext.cwd ?? process.cwd(),
      timestamp: Date.now(),
      ...additionalContext,
    };

    let output: HookOutput = { continue: true };

    for (const hook of hooks) {
      if (!hook.enabled && hook.enabled !== undefined) continue;

      try {
        const result = await hook.handler(params, context);

        if (result) {
          // Merge outputs
          output = this.mergeOutput(output, result);

          // Check if we should stop
          if (output.continue === false) {
            warn('system', `Hook ${hook.name} stopped execution`);
            break;
          }
        }
      } catch (err) {
        error('system', `Hook ${hook.name} failed:`, err instanceof Error ? err : undefined);
      }
    }

    return output;
  }

  /**
   * Merge multiple hook outputs
   */
  private mergeOutput(base: HookOutput, next: HookOutput): HookOutput {
    const mergedSpecific: HookSpecificOutput = {
      hookEventName: next.hookSpecificOutput?.hookEventName
        ?? base.hookSpecificOutput?.hookEventName
        ?? 'Stop',
      permissionDecision: next.hookSpecificOutput?.permissionDecision
        ?? base.hookSpecificOutput?.permissionDecision,
      updatedInput: next.hookSpecificOutput?.updatedInput
        ?? base.hookSpecificOutput?.updatedInput,
      additionalContext: next.hookSpecificOutput?.additionalContext
        ?? base.hookSpecificOutput?.additionalContext,
    };

    return {
      continue: next.continue ?? base.continue,
      suppressOutput: next.suppressOutput ?? base.suppressOutput,
      stopReason: next.stopReason ?? base.stopReason,
      decision: next.decision ?? base.decision,
      reason: next.reason ?? base.reason,
      systemMessage: next.systemMessage ?? base.systemMessage,
      hookSpecificOutput: mergedSpecific,
    };
  }

  // -------------------------------------------------------------------------
  // Pre-defined hook execution methods
  // -------------------------------------------------------------------------

  /**
   * Execute PreToolUse hooks
   */
  async preToolUse(
    params: PreToolUseParams
  ): Promise<HookOutput> {
    return this.executeHooks('PreToolUse', params);
  }

  /**
   * Execute PostToolUse hooks
   */
  async postToolUse(
    params: PostToolUseParams
  ): Promise<HookOutput> {
    return this.executeHooks('PostToolUse', params);
  }

  /**
   * Execute PostToolUseFailure hooks
   */
  async postToolUseFailure(
    params: PostToolUseFailureParams
  ): Promise<HookOutput> {
    return this.executeHooks('PostToolUseFailure', params);
  }

  /**
   * Execute Stop hooks
   */
  async stop(
    params: StopParams
  ): Promise<HookOutput> {
    return this.executeHooks('Stop', params);
  }

  /**
   * Execute SessionStart hooks
   */
  async sessionStart(
    params: SessionStartParams
  ): Promise<HookOutput> {
    return this.executeHooks('SessionStart', params);
  }

  /**
   * Execute SessionEnd hooks
   */
  async sessionEnd(
    params: SessionEndParams
  ): Promise<HookOutput> {
    return this.executeHooks('SessionEnd', params);
  }

  /**
   * Execute PermissionRequest hooks
   */
  async permissionRequest(
    params: PermissionRequestParams
  ): Promise<HookOutput> {
    return this.executeHooks('PermissionRequest', params);
  }

  /**
   * Execute PreCompact hooks
   */
  async preCompact(
    params: CompactParams
  ): Promise<HookOutput> {
    return this.executeHooks('PreCompact', params);
  }

  /**
   * Execute PostCompact hooks
   */
  async postCompact(
    params: CompactParams
  ): Promise<HookOutput> {
    return this.executeHooks('PostCompact', params);
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let hookExecutor: ToolHookExecutor | null = null;

export function getHookExecutor(): ToolHookExecutor {
  if (!hookExecutor) {
    hookExecutor = new ToolHookExecutor();
  }
  return hookExecutor;
}

export function resetHookExecutor(): void {
  hookExecutor = null;
}

// ============================================================================
// Built-in Hooks
// ============================================================================

/**
 * Create a logging hook
 */
export function createLoggingHook(event: HookEvent): HookDefinition {
  return {
    id: `logging-${event}`,
    name: `${event} Logger`,
    event,
    type: 'function',
    description: `Logs ${event} events`,
    priority: 1000, // Run last
    handler: async (params) => {
      info('system', `${event}: ${JSON.stringify(params).slice(0, 200)}`);
    },
  };
}

/**
 * Create a stop-on-error hook for PostToolUseFailure
 */
export function createStopOnErrorHook(): HookDefinition {
  return {
    id: 'stop-on-tool-error',
    name: 'Stop on Tool Error',
    event: 'PostToolUseFailure',
    type: 'function',
    description: 'Stops execution on tool errors',
    priority: 1, // Run first
    handler: async (params: unknown) => {
      const p = params as PostToolUseFailureParams;
      warn('system', `Tool ${p.toolName} failed: ${p.error}`);
      return {
        continue: false,
        stopReason: `Tool ${p.toolName} failed: ${p.error}`,
        hookSpecificOutput: {
          hookEventName: 'PostToolUseFailure',
          additionalContext: `Error: ${p.error}`,
        },
      };
    },
  };
}

/**
 * Create a memory-saving hook for PostToolUse
 */
export function createMemorySaveHook(): HookDefinition {
  return {
    id: 'memory-save-post-tool',
    name: 'Memory Save on Tool Use',
    event: 'PostToolUse',
    type: 'function',
    description: 'Saves observations after tool use',
    priority: 500,
    handler: async (params: unknown) => {
      const p = params as PostToolUseParams;
      // Import observation buffer lazily to avoid circular deps
      try {
        const { getObservationBuffer } = await import('../memory/observation-buffer.js');
        const buffer = getObservationBuffer();

        buffer.recordObservation({
          timestamp: Date.now(),
          toolName: p.toolName,
          args: p.args,
          result: p.result.slice(0, 500),
          success: true,
        });
      } catch {
        // Memory module not available
      }
    },
  };
}
