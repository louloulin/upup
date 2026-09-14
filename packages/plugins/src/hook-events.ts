/**
 * UpUp Hook Events System
 *
 * Implements Claude Code compatible hook events:
 * - 27 hook event types matching Claude Code v2.1.138
 * - Plugin hook registration and invocation
 * - Hook context management
 *
 * Reference: Claude Code's src/entrypoints/sdk/coreTypes.ts:25
 */

// ============================================================================
// Hook Event Types
// ============================================================================

/**
 * All supported hook events (matching Claude Code's HOOK_EVENTS)
 */
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
  'CwdChanged',
  'FileChanged',
] as const;

export type HookEvent = typeof HOOK_EVENTS[number];

/**
 * Hook event categories for organization
 */
export const HOOK_EVENT_CATEGORIES = {
  TOOL: ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'] as const,
  SESSION: ['SessionStart', 'SessionEnd', 'Stop', 'StopFailure'] as const,
  AGENT: ['SubagentStart', 'SubagentStop', 'TeammateIdle', 'TaskCreated', 'TaskCompleted'] as const,
  COMPACT: ['PreCompact', 'PostCompact'] as const,
  PERMISSION: ['PermissionRequest', 'PermissionDenied'] as const,
  USER: ['UserPromptSubmit', 'Elicitation', 'ElicitationResult'] as const,
  SYSTEM: ['Notification', 'Setup', 'ConfigChange'] as const,
  WORKTREE: ['WorktreeCreate', 'WorktreeRemove'] as const,
  CONTEXT: ['InstructionsLoaded', 'CwdChanged', 'FileChanged'] as const,
} as const;

// ============================================================================
// Hook Context Types
// ============================================================================

/**
 * Base hook context
 */
export interface BaseHookContext {
  /** Event name */
  event: HookEvent;
  /** Event timestamp */
  timestamp: number;
  /** Session ID if available */
  sessionId?: string;
  /** Process ID */
  pid?: number;
  /** Current working directory */
  cwd?: string;
}

/**
 * Tool hook context
 */
export interface ToolHookContext extends BaseHookContext {
  tool: string;
  input?: unknown;
  result?: unknown;
  error?: string;
}

/**
 * Session hook context
 */
export interface SessionHookContext extends BaseHookContext {
  sessionId: string;
  startedAt?: number;
  endedAt?: number;
}

/**
 * Message hook context
 */
export interface MessageHookContext extends BaseHookContext {
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * File hook context
 */
export interface FileHookContext extends BaseHookContext {
  path: string;
  action?: 'create' | 'modify' | 'delete';
  metadata?: Record<string, unknown>;
}

/**
 * Worktree hook context
 */
export interface WorktreeHookContext extends BaseHookContext {
  worktreePath: string;
  worktreeName: string;
  originalBranch?: string;
}

/**
 * Permission hook context
 */
export interface PermissionHookContext extends BaseHookContext {
  permission: string;
  tool?: string;
  reason?: string;
  granted?: boolean;
}

// Union type for all hook contexts
export type HookContext =
  | ToolHookContext
  | SessionHookContext
  | MessageHookContext
  | FileHookContext
  | WorktreeHookContext
  | PermissionHookContext
  | BaseHookContext;

// ============================================================================
// Hook Handler Types
// ============================================================================

/**
 * Hook handler function
 */
export type HookHandler = (context: HookContext) => Promise<void> | void;

/**
 * Hook matcher for conditional execution
 */
export interface HookMatcher {
  /** Pattern to match against tool name or other identifier */
  pattern?: string;
  /** Custom matcher function */
  matcher?: (context: HookContext) => boolean;
}

/**
 * Hook registration with metadata
 */
export interface HookRegistration {
  event: HookEvent;
  handler: HookHandler;
  matcher?: HookMatcher;
  pluginName?: string;
  pluginId?: string;
  pluginRoot?: string;
  priority?: number;
}

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * Hook Registry - manages hook registrations and invocations
 */
export class HookRegistry {
  private handlers: Map<HookEvent, HookRegistration[]> = new Map();
  private enabled = true;

  /**
   * Register a hook handler
   */
  register(registration: HookRegistration): void {
    const { event } = registration;

    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    const handlers = this.handlers.get(event)!;
    handlers.push(registration);

    // Sort by priority
    handlers.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }

  /**
   * Register multiple hooks from a plugin
   */
  registerPlugin(pluginName: string, pluginId: string, pluginRoot: string, hooks: Partial<Record<HookEvent, HookHandler | HookHandler[]>>): void {
    for (const [event, handler] of Object.entries(hooks)) {
      const handlers = Array.isArray(handler) ? handler : [handler];
      for (const h of handlers) {
        this.register({
          event: event as HookEvent,
          handler: h,
          pluginName,
          pluginId,
          pluginRoot,
        });
      }
    }
  }

  /**
   * Unregister all hooks for a plugin
   */
  unregisterPlugin(pluginId: string): void {
    for (const [event, handlers] of this.handlers.entries()) {
      const filtered = handlers.filter(h => h.pluginId !== pluginId);
      if (filtered.length === 0) {
        this.handlers.delete(event);
      } else {
        this.handlers.set(event, filtered);
      }
    }
  }

  /**
   * Get handlers for an event
   */
  getHandlers(event: HookEvent): HookRegistration[] {
    return this.handlers.get(event) ?? [];
  }

  /**
   * Check if event has handlers
   */
  hasHandlers(event: HookEvent): boolean {
    const handlers = this.handlers.get(event);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Invoke hooks for an event
   */
  async invoke(event: HookEvent, context: HookContext): Promise<void> {
    if (!this.enabled) return;

    const handlers = this.handlers.get(event);
    if (!handlers || handlers.length === 0) return;

    for (const registration of handlers) {
      // Check matcher if present
      if (registration.matcher?.matcher) {
        if (!registration.matcher.matcher(context)) {
          continue;
        }
      }
      if (registration.matcher?.pattern) {
        // Simple pattern matching on tool name
        const ctx = context as ToolHookContext;
        if (!ctx.tool?.includes(registration.matcher.pattern)) {
          continue;
        }
      }

      try {
        await registration.handler(context);
      } catch (error) {
        console.error(`Hook ${event} failed for plugin ${registration.pluginId}:`, error);
      }
    }
  }

  /**
   * Enable/disable hooks
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): HookEvent[] {
    return [...this.handlers.keys()];
  }

  /**
   * Get hook statistics
   */
  getStats(): { event: HookEvent; count: number }[] {
    return [...this.handlers.entries()].map(([event, handlers]) => ({
      event,
      count: handlers.length,
    }));
  }
}

// ============================================================================
// Hook Invocation Helpers
// ============================================================================

/**
 * Create base hook context
 */
export function createBaseContext(partial?: Partial<BaseHookContext>): BaseHookContext {
  return {
    event: 'Setup',
    timestamp: Date.now(),
    ...partial,
  };
}

/**
 * Create tool hook context
 */
export function createToolContext(tool: string, partial?: Partial<ToolHookContext>): ToolHookContext {
  return {
    ...createBaseContext({ event: 'PreToolUse' } as BaseHookContext),
    tool,
    ...partial,
  };
}

/**
 * Create session hook context
 */
export function createSessionContext(sessionId: string, partial?: Partial<SessionHookContext>): SessionHookContext {
  return {
    ...createBaseContext({ event: 'SessionStart', sessionId } as BaseHookContext),
    sessionId,
    ...partial,
  };
}

// ============================================================================
// Global Registry Instance
// ============================================================================

let globalRegistry: HookRegistry | null = null;

export function getHookRegistry(): HookRegistry {
  if (!globalRegistry) {
    globalRegistry = new HookRegistry();
  }
  return globalRegistry;
}

export function resetHookRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clear();
    globalRegistry = null;
  }
}

// ============================================================================
// Pre-built Hook Patterns
// ============================================================================

/**
 * Match hooks for specific tool names
 */
export function toolMatcher(tools: string | string[]): HookMatcher {
  const toolList = Array.isArray(tools) ? tools : [tools];
  return {
    matcher: (context: HookContext) => {
      const ctx = context as ToolHookContext;
      return toolList.includes(ctx.tool);
    },
  };
}

/**
 * Match hooks for tool name prefix
 */
export function toolPrefixMatcher(prefix: string): HookMatcher {
  return {
    matcher: (context: HookContext) => {
      const ctx = context as ToolHookContext;
      return ctx.tool?.startsWith(prefix) ?? false;
    },
  };
}

/**
 * Match hooks for file operations
 */
export function fileMatcher(pathPattern: RegExp): HookMatcher {
  return {
    matcher: (context: HookContext) => {
      const ctx = context as FileHookContext;
      return pathPattern.test(ctx.path);
    },
  };
}