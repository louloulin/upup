/**
 * Shared types for bash tool
 *
 * This file contains types that are shared between multiple bash modules
 * to avoid circular dependencies.
 */

// ============================================================================
// Permission Mode
// ============================================================================

export type PermissionMode = 'bypass' | 'allow' | 'ask' | 'deny';

// ============================================================================
// Command Classification
// ============================================================================

export type CommandClassification = 'read' | 'write' | 'unknown';

export interface CommandInfo {
  /** Base command name */
  command: string;
  /** Classification */
  classification: CommandClassification;
  /** Permission mode */
  mode: PermissionMode;
  /** Whether it requires approval */
  requiresApproval: boolean;
  /** Human-readable description */
  description: string;
  /** Destructive warning if applicable */
  destructiveWarning?: string;
}

// ============================================================================
// Bash Tool Result
// ============================================================================

export interface BashToolResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code */
  exitCode: number;
  /** Whether the command timed out */
  timedOut?: boolean;
  /** Execution duration in ms */
  durationMs: number;
  /** Truncated output indicator */
  truncated?: boolean;
  /** Security warnings */
  securityWarnings?: string[];
  /** Execution phases timing (optional) */
  phases?: {
    validation?: number;
    execution?: number;
  };
}
