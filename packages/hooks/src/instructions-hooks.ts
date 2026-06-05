/**
 * Instructions Hook - Hook event for InstructionsLoaded
 *
 * Provides hooks for:
 * - InstructionsLoaded: When CLAUDE.md or AGENTS.md is loaded
 * - InstructionsChanged: When instructions are modified
 *
 * Reference: Loucode's InstructionsLoaded hook event
 */

import { info, warn, debug } from '@upup/utils/logging';

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Instructions hook event types
 */
export type InstructionsHookEvent = 'InstructionsLoaded' | 'InstructionsChanged' | 'InstructionsReloaded';

/**
 * Instructions hook context
 */
export interface InstructionsHookContext {
  /** File path of the instructions */
  filePath: string;
  /** File type (CLAUDE.md, AGENTS.md, etc.) */
  fileType: 'CLAUDE' | 'AGENTS' | 'GEMINI' | 'RULES' | 'OTHER';
  /** Session ID */
  sessionId: string;
  /** Working directory */
  cwd: string;
  /** Trigger timestamp */
  timestamp: number;
  /** Content of the instructions (truncated) */
  contentPreview?: string;
  /** Content hash for change detection */
  contentHash?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Instructions hook result
 */
export interface InstructionsHookResult {
  /** Continue after hook */
  continue: boolean;
  /** Additional context to inject */
  additionalContext?: string;
  /** Warning message */
  warning?: string;
  /** Error message */
  error?: string;
  /** Metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Instructions hook definition
 */
export interface InstructionsHook {
  /** Unique ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Event type */
  event: InstructionsHookEvent;
  /** File type filter (empty = all) */
  fileTypes?: InstructionsHookContext['fileType'][];
  /** Whether hook is enabled */
  enabled?: boolean;
  /** Priority (lower = earlier) */
  priority?: number;
  /** Execute the hook */
  execute: (context: InstructionsHookContext) => Promise<InstructionsHookResult>;
}

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * Instructions Hook Registry - Central registry for instructions hooks
 */
export class InstructionsHookRegistry {
  private hooks: Map<string, InstructionsHook> = new Map();
  private events: Map<InstructionsHookEvent, string[]> = new Map();
  private lastLoaded: Map<string, string> = new Map();

  /**
   * Register an instructions hook
   */
  register(hook: InstructionsHook): void {
    const id = hook.id || `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.hooks.set(id, { ...hook, id });

    // Register for event
    if (!this.events.has(hook.event)) {
      this.events.set(hook.event, []);
    }
    this.events.get(hook.event)!.push(id);

    // Sort by priority
    this.sortEventHooks(hook.event);

    debug('instructions-hooks', `Registered instructions hook: ${hook.name} for ${hook.event}`);
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
   * Fire instructions hook
   */
  async fire(event: InstructionsHookEvent, context: InstructionsHookContext): Promise<InstructionsHookResult[]> {
    const hookIds = this.events.get(event) || [];
    const results: InstructionsHookResult[] = [];

    for (const hookId of hookIds) {
      const hook = this.hooks.get(hookId);
      if (!hook || hook.enabled === false) {
        continue;
      }

      // Check file type filter
      if (hook.fileTypes && hook.fileTypes.length > 0) {
        if (!hook.fileTypes.includes(context.fileType)) {
          continue;
        }
      }

      try {
        const result = await hook.execute(context);
        results.push(result);

        if (!result.continue) {
          warn('instructions-hooks', `Hook ${hook.name} blocked ${event}`);
          break;
        }
      } catch (err) {
        warn('instructions-hooks', `Hook ${hook.name} failed: ${err}`);
        results.push({ continue: true, error: String(err) });
      }
    }

    return results;
  }

  /**
   * Fire InstructionsLoaded hook
   */
  async fireInstructionsLoaded(context: InstructionsHookContext): Promise<InstructionsHookResult[]> {
    info('instructions-hooks', `Firing InstructionsLoaded hook for ${context.filePath}`);
    return this.fire('InstructionsLoaded', context);
  }

  /**
   * Fire InstructionsChanged hook
   */
  async fireInstructionsChanged(context: InstructionsHookContext): Promise<InstructionsHookResult[]> {
    const lastHash = this.lastLoaded.get(context.filePath);
    if (lastHash && lastHash === context.contentHash) {
      // No actual change
      return [];
    }

    this.lastLoaded.set(context.filePath, context.contentHash || '');
    info('instructions-hooks', `Firing InstructionsChanged hook for ${context.filePath}`);
    return this.fire('InstructionsChanged', context);
  }

  /**
   * Get all registered hooks
   */
  getAllHooks(): InstructionsHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get hooks for an event
   */
  getHooksForEvent(event: InstructionsHookEvent): InstructionsHook[] {
    const hookIds = this.events.get(event) || [];
    return hookIds.map((id) => this.hooks.get(id)).filter(Boolean) as InstructionsHook[];
  }

  /**
   * Clear loaded cache
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.lastLoaded.delete(filePath);
    } else {
      this.lastLoaded.clear();
    }
  }

  private sortEventHooks(event: InstructionsHookEvent): void {
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
 * Create knowledge extraction hook
 */
export function createKnowledgeExtractionHook(): InstructionsHook {
  return {
    id: 'knowledge-extraction',
    name: 'Knowledge Extraction Hook',
    event: 'InstructionsLoaded',
    fileTypes: ['CLAUDE', 'AGENTS'],
    priority: 50,
    async execute(context): Promise<InstructionsHookResult> {
      // Extract key directives from CLAUDE.md
      if (context.fileType === 'CLAUDE' && context.contentPreview) {
        const directives = extractDirectives(context.contentPreview);
        if (directives.length > 0) {
          debug('instructions-hooks', `Extracted ${directives.length} directives from ${context.filePath}`);
        }
      }

      return { continue: true };
    },
  };
}

/**
 * Create validation hook
 */
export function createValidationHook(): InstructionsHook {
  return {
    id: 'instructions-validation',
    name: 'Instructions Validation Hook',
    event: 'InstructionsLoaded',
    fileTypes: ['CLAUDE', 'AGENTS', 'GEMINI'],
    priority: 80,
    async execute(context): Promise<InstructionsHookResult> {
      // Validate instruction file structure
      const warnings: string[] = [];

      if (context.contentPreview) {
        // Check for common issues
        if (context.contentPreview.length > 50000) {
          warnings.push('Instructions file is very large (>50KB). Consider splitting.');
        }

        // Check for required sections
        if (!context.contentPreview.includes('#') && !context.contentPreview.includes('##')) {
          warnings.push('No markdown headers found. Consider adding structure.');
        }
      }

      if (warnings.length > 0) {
        return { continue: true, warning: warnings.join('; ') };
      }

      return { continue: true };
    },
  };
}

/**
 * Extract directives from content
 */
function extractDirectives(content: string): string[] {
  const directives: string[] = [];

  // Match patterns like "ALWAYS:", "NEVER:", "DO NOT:", "PREFER:"
  const directivePatterns = [
    /\b(ALWAYS|NEVER|DO\s*NOT|PREFER|SUGGEST|AVOID|REQUIRE|MUST)[:\s]/gi,
  ];

  for (const pattern of directivePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      directives.push(match[0]);
    }
  }

  return directives;
}

// ============================================================================
// Singleton Registry
// ============================================================================

let registryInstance: InstructionsHookRegistry | null = null;

export function getInstructionsHookRegistry(): InstructionsHookRegistry {
  if (!registryInstance) {
    registryInstance = new InstructionsHookRegistry();
    // Register default hooks
    registryInstance.register(createKnowledgeExtractionHook());
    registryInstance.register(createValidationHook());
  }
  return registryInstance;
}

export function resetInstructionsHookRegistry(): void {
  registryInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register an instructions hook
 */
export function registerInstructionsHook(hook: InstructionsHook): void {
  getInstructionsHookRegistry().register(hook);
}

/**
 * Unregister an instructions hook
 */
export function unregisterInstructionsHook(hookId: string): boolean {
  return getInstructionsHookRegistry().unregister(hookId);
}

/**
 * Emit instructions loaded event
 */
export async function emitInstructionsLoaded(
  filePath: string,
  fileType: InstructionsHookContext['fileType'],
  sessionId: string,
  contentHash?: string
): Promise<InstructionsHookResult[]> {
  return getInstructionsHookRegistry().fireInstructionsLoaded({
    filePath,
    fileType,
    sessionId,
    cwd: process.cwd(),
    timestamp: Date.now(),
    contentHash,
  });
}

/**
 * Emit instructions changed event
 */
export async function emitInstructionsChanged(
  filePath: string,
  fileType: InstructionsHookContext['fileType'],
  sessionId: string,
  contentHash?: string,
  contentPreview?: string
): Promise<InstructionsHookResult[]> {
  return getInstructionsHookRegistry().fireInstructionsChanged({
    filePath,
    fileType,
    sessionId,
    cwd: process.cwd(),
    timestamp: Date.now(),
    contentHash,
    contentPreview,
  });
}

/**
 * Determine file type from path
 */
export function getFileType(filePath: string): InstructionsHookContext['fileType'] {
  const basename = filePath.split('/').pop() || '';
  const lower = basename.toLowerCase();

  if (lower === 'claude.md') return 'CLAUDE';
  if (lower === 'agents.md') return 'AGENTS';
  if (lower === 'gemini.md') return 'GEMINI';
  if (lower === 'rules.md') return 'RULES';

  return 'OTHER';
}