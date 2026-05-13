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
