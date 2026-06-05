/**
 * Tool Error Cascade - Claude Code-style error propagation
 *
 * Features:
 * - Bash errors cascade to sibling tools
 * - Abort controller hierarchy
 * - Tool interruption handling
 *
 * Reference: Loucode's StreamingToolExecutor.ts Bash Error Cascade
 */

import { info, warn, error } from '@upup/utils/logging/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Tool error with metadata
 */
export interface ToolError {
  toolName: string;
  error: Error;
  isFatal: boolean;
  toolCallId?: string;
}

/**
 * Tool execution state
 */
export interface ToolExecutionState {
  id: string;
  toolName: string;
  status: 'queued' | 'executing' | 'completed' | 'failed' | 'aborted';
  abortController: AbortController;
  startTime?: number;
  endTime?: number;
  result?: string;
  error?: string;
}

/**
 * Interruption behavior
 */
export type InterruptionBehavior = 'cancel' | 'block' | 'warn';

/**
 * Cascade configuration
 */
export interface CascadeConfig {
  /** Enable bash error cascade */
  enableBashCascade: boolean;
  /** Cascade all errors (not just fatal) */
  cascadeAllErrors: boolean;
  /** Tool to cascade from */
  cascadeFromTool: string;
  /** Tools to cascade to */
  cascadeToTools: string[];
  /** Default interruption behavior */
  defaultBehavior: InterruptionBehavior;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CascadeConfig = {
  enableBashCascade: true,
  cascadeAllErrors: false,
  cascadeFromTool: 'bash',
  cascadeToTools: [], // Empty means all other tools
  defaultBehavior: 'cancel',
};

// ============================================================================
// Error Cascade Handler
// ============================================================================

export class ErrorCascadeHandler {
  private config: CascadeConfig;
  private executionStates: Map<string, ToolExecutionState> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private listeners: Set<(event: CascadeEvent) => void> = new Set();

  constructor(config: Partial<CascadeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Tool Registration
  // -------------------------------------------------------------------------

  /**
   * Register a tool execution
   */
  register(
    id: string,
    toolName: string,
    parentController?: AbortController
  ): AbortController {
    const controller = new AbortController();

    // Link to parent controller
    if (parentController) {
      parentController.signal.addEventListener('abort', () => {
        controller.abort('Parent aborted');
      });
    }

    const state: ToolExecutionState = {
      id,
      toolName,
      status: 'queued',
      abortController: controller,
    };

    this.executionStates.set(id, state);
    this.abortControllers.set(id, controller);

    info('tools', `Registered tool: ${toolName} (${id})`);

    return controller;
  }

  /**
   * Start tool execution
   */
  start(id: string): void {
    const state = this.executionStates.get(id);
    if (state) {
      state.status = 'executing';
      state.startTime = Date.now();
      this.emit({ type: 'start', id, toolName: state.toolName });
    }
  }

  /**
   * Complete tool execution
   */
  complete(id: string, result: string): void {
    const state = this.executionStates.get(id);
    if (state) {
      state.status = 'completed';
      state.endTime = Date.now();
      state.result = result;
      this.unregister(id);
      this.emit({ type: 'complete', id, toolName: state.toolName, duration: state.endTime - (state.startTime ?? state.endTime) });
    }
  }

  /**
   * Fail tool execution with cascade
   */
  fail(id: string, err: Error, isFatal = true): void {
    const state = this.executionStates.get(id);
    if (!state) return;

    state.status = 'failed';
    state.endTime = Date.now();
    state.error = err.message;

    const toolError: ToolError = {
      toolName: state.toolName,
      error: err,
      isFatal,
      toolCallId: id,
    };

    warn('tools', `Tool ${state.toolName} failed: ${err.message} (fatal: ${isFatal})`);

    // Cascade if enabled
    if (this.shouldCascade(toolError)) {
      this.cascade(toolError);
    }

    this.unregister(id);
    this.emit({
      type: 'fail',
      id,
      toolName: state.toolName,
      error: err.message,
      fatal: isFatal,
    });
  }

  /**
   * Abort tool execution
   */
  abort(id: string, reason?: string): void {
    const state = this.executionStates.get(id);
    if (!state) return;

    state.status = 'aborted';
    state.endTime = Date.now();

    this.abortControllers.get(id)?.abort(reason ?? 'Aborted');

    this.emit({
      type: 'abort',
      id,
      toolName: state.toolName,
      reason,
    });
  }

  /**
   * Unregister tool
   */
  unregister(id: string): void {
    const state = this.executionStates.get(id);
    if (state) {
      this.emit({ type: 'unregister', id, toolName: state.toolName });
    }
    this.executionStates.delete(id);
    this.abortControllers.delete(id);
  }

  // -------------------------------------------------------------------------
  // Cascade Logic
  // -------------------------------------------------------------------------

  /**
   * Check if error should cascade
   */
  private shouldCascade(toolError: ToolError): boolean {
    if (!this.config.enableBashCascade) return false;

    // Only cascade from bash
    if (toolError.toolName !== this.config.cascadeFromTool) return false;

    // Check if error should cascade
    if (this.config.cascadeAllErrors) return true;
    return toolError.isFatal;
  }

  /**
   * Cascade error to sibling tools
   */
  private cascade(toolError: ToolError): void {
    const executingTools = Array.from(this.executionStates.values())
      .filter(s => s.status === 'executing' && s.toolName !== toolError.toolName);

    if (executingTools.length === 0) {
      info('tools', 'No sibling tools to cascade to');
      return;
    }

    warn('tools', `Cascading ${toolError.toolName} error to ${executingTools.length} sibling tools`);

    for (const sibling of executingTools) {
      const behavior = this.config.defaultBehavior;

      switch (behavior) {
        case 'cancel':
          this.abort(sibling.id, `Sibling tool ${toolError.toolName} failed: ${toolError.error.message}`);
          break;

        case 'block':
          // Don't abort, but mark for blocking
          this.emit({
            type: 'block',
            id: sibling.id,
            toolName: sibling.toolName,
            reason: `Blocked by ${toolError.toolName} failure`,
          });
          break;

        case 'warn':
          // Just emit a warning event
          this.emit({
            type: 'warn',
            id: sibling.id,
            toolName: sibling.toolName,
            reason: `Warning: sibling tool ${toolError.toolName} failed`,
          });
          break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // State Queries
  // -------------------------------------------------------------------------

  /**
   * Get tool execution state
   */
  getState(id: string): ToolExecutionState | undefined {
    return this.executionStates.get(id);
  }

  /**
   * Get all executing tools
   */
  getExecutingTools(): ToolExecutionState[] {
    return Array.from(this.executionStates.values())
      .filter(s => s.status === 'executing');
  }

  /**
   * Get abort controller for a tool
   */
  getAbortController(id: string): AbortController | undefined {
    return this.abortControllers.get(id);
  }

  /**
   * Check if any tool is executing
   */
  hasExecutingTools(): boolean {
    return Array.from(this.executionStates.values())
      .some(s => s.status === 'executing');
  }

  // -------------------------------------------------------------------------
  // Event Listeners
  // -------------------------------------------------------------------------

  /**
   * Subscribe to cascade events
   */
  subscribe(listener: (event: CascadeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to listeners
   */
  private emit(event: CascadeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Abort all executing tools
   */
  abortAll(reason = 'Aborting all tools'): void {
    for (const [id, state] of this.executionStates) {
      if (state.status === 'executing') {
        this.abort(id, reason);
      }
    }
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.abortAll('Clearing cascade handler');
    this.executionStates.clear();
    this.abortControllers.clear();
  }
}

// ============================================================================
// Cascade Events
// ============================================================================

export type CascadeEvent =
  | { type: 'start'; id: string; toolName: string }
  | { type: 'complete'; id: string; toolName: string; duration: number }
  | { type: 'fail'; id: string; toolName: string; error: string; fatal: boolean }
  | { type: 'abort'; id: string; toolName: string; reason?: string }
  | { type: 'block'; id: string; toolName: string; reason: string }
  | { type: 'warn'; id: string; toolName: string; reason: string }
  | { type: 'unregister'; id: string; toolName: string };

// ============================================================================
// Singleton instance
// ============================================================================

let cascadeHandler: ErrorCascadeHandler | null = null;

export function getCascadeHandler(): ErrorCascadeHandler {
  if (!cascadeHandler) {
    cascadeHandler = new ErrorCascadeHandler();
  }
  return cascadeHandler;
}

export function resetCascadeHandler(): void {
  cascadeHandler?.clear();
  cascadeHandler = null;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Classify if a tool error is fatal
 */
export function isFatalError(error: Error, toolName: string): boolean {
  // Bash errors are typically fatal
  if (toolName === 'bash') {
    // Non-zero exit codes are fatal
    if (error.message.includes('exit code')) return true;
    // Permission errors
    if (error.message.includes('permission denied')) return true;
    // Command not found
    if (error.message.includes('not found')) return true;
  }

  // Write errors are fatal
  if (toolName === 'write_file' || toolName === 'edit_file') {
    if (error.message.includes('ENOENT')) return false; // File not found is recoverable
    if (error.message.includes('EACCES')) return true;
  }

  return true;
}

/**
 * Get error message for display
 */
export function formatErrorMessage(error: Error, toolName: string): string {
  if (toolName === 'bash') {
    // Extract exit code if present
    const match = error.message.match(/exit code (\d+)/);
    if (match) {
      const code = parseInt(match[1], 10);
      return `Bash command failed with exit code ${code}`;
    }
  }
  return `${toolName} error: ${error.message}`;
}
