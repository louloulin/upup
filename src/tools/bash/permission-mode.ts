/**
 * Permission Mode Module
 *
 * Manages permission modes for command execution:
 * - bypass: Always allow
 * - allow: Allow without prompt
 * - ask: Ask user for confirmation
 * - deny: Always deny
 *
 * Reference: Loucode's modeValidation.ts and permissions.ts
 */

import type { CommandClassification, PermissionMode } from './types.js';
import { getCommandInfo, classifyCommand } from './command-classifier.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

// ============================================================================
// Types
// ============================================================================

// PermissionMode is defined in types.ts and re-exported here
export type { PermissionMode };
export type { CommandClassification } from './types.js';

export interface PermissionRequest {
  command: string;
  classification: CommandClassification;
  reason: string;
  suggestions?: PermissionSuggestion[];
}

export interface PermissionSuggestion {
  pattern: string;
  mode: PermissionMode;
  label: string;
}

export interface PermissionResult {
  allowed: boolean;
  mode: PermissionMode;
  reason?: string;
  suggestions?: PermissionSuggestion[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Permission modes and their behaviors
 */
export const PERMISSION_MODE_BEHAVIORS: Record<PermissionMode, {
  allows: boolean;
  requiresConfirmation: boolean;
  persists: boolean;
}> = {
  bypass: {
    allows: true,
    requiresConfirmation: false,
    persists: false,
  },
  allow: {
    allows: true,
    requiresConfirmation: false,
    persists: true,
  },
  ask: {
    allows: false, // Initially denied until user confirms
    requiresConfirmation: true,
    persists: false,
  },
  deny: {
    allows: false,
    requiresConfirmation: false,
    persists: true,
  },
};

/**
 * Default permission mode
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'ask';

/**
 * Modes that allow execution without confirmation
 */
export const NO_CONFIRMATION_MODES: PermissionMode[] = ['bypass', 'allow'];

/**
 * Modes that block execution
 */
export const BLOCKING_MODES: PermissionMode[] = ['ask', 'deny'];

// ============================================================================
// Permission Rules
// ============================================================================

interface PermissionRule {
  pattern: RegExp;
  mode: PermissionMode;
  description: string;
}

/**
 * Built-in permission rules
 */
const BUILT_IN_RULES: PermissionRule[] = [
  // Always allow safe commands
  { pattern: /^pwd$/i, mode: 'bypass', description: 'Print working directory' },
  { pattern: /^echo\s+/i, mode: 'bypass', description: 'Print to stdout' },
  { pattern: /^true$/i, mode: 'bypass', description: 'No-op command' },
  { pattern: /^false$/i, mode: 'bypass', description: 'No-op command (failure)' },
  { pattern: /^:\s*$/i, mode: 'bypass', description: 'No-op command' },
  { pattern: /^cd\s+$/i, mode: 'bypass', description: 'Change directory' },
  { pattern: /^cd\s+\S/i, mode: 'bypass', description: 'Change directory' },

  // Read-only commands (with and without arguments)
  { pattern: /^ls(\s|$)/i, mode: 'bypass', description: 'List files' },
  { pattern: /^cat\s+/i, mode: 'bypass', description: 'Display file' },
  { pattern: /^grep\s+/i, mode: 'bypass', description: 'Search files' },
  { pattern: /^find\s+/i, mode: 'bypass', description: 'Find files' },
  { pattern: /^ps\s+/i, mode: 'bypass', description: 'Process status' },
  { pattern: /^git\s+(log|show|diff|status|branch|tag|remote|stash)/i, mode: 'bypass', description: 'Git read operation' },

  // Ask for write operations
  { pattern: /^rm\s+/i, mode: 'ask', description: 'Remove files' },
  { pattern: /^rmdir\s+/i, mode: 'ask', description: 'Remove directory' },
  { pattern: /^mkdir\s+/i, mode: 'ask', description: 'Create directory' },
  { pattern: /^cp\s+/i, mode: 'ask', description: 'Copy files' },
  { pattern: /^mv\s+/i, mode: 'ask', description: 'Move files' },
  { pattern: /^chmod\s+/i, mode: 'ask', description: 'Change permissions' },
  { pattern: /^chown\s+/i, mode: 'ask', description: 'Change owner' },
  { pattern: /^git\s+(add|commit|push|pull|merge)/i, mode: 'ask', description: 'Git write operation' },
  { pattern: /^npm\s+(install|uninstall|update)/i, mode: 'ask', description: 'NPM package operation' },
  { pattern: /^yarn\s+(add|remove)/i, mode: 'ask', description: 'Yarn package operation' },
  { pattern: /^docker\s+(run|build|rm|rmi)/i, mode: 'ask', description: 'Docker operation' },

  // Always deny destructive operations
  { pattern: /:\(\)\{:\|:&\};:/, mode: 'deny', description: 'Fork bomb' },
  { pattern: /^rm\s+-rf\s+\//i, mode: 'deny', description: 'Delete root filesystem' },
  { pattern: /^mkfs\b/, mode: 'deny', description: 'Create filesystem' },
  { pattern: /^dd\s+.*of=\//i, mode: 'deny', description: 'Write to raw device' },
];

// ============================================================================
// Permission Store
// ============================================================================

/**
 * In-memory permission store
 * In production, this should be persisted to disk
 */
class PermissionStore {
  private rules: Map<string, PermissionMode> = new Map();
  private history: PermissionResult[] = [];
  private persistPath: string | null = null;

  /** Set the file path for persisting rules */
  setPersistPath(filePath: string): void {
    this.persistPath = filePath;
  }

  /**
   * Get permission mode for a command pattern
   */
  getMode(pattern: string): PermissionMode | undefined {
    return this.rules.get(pattern);
  }

  /**
   * Set permission mode for a command pattern
   */
  setMode(pattern: string, mode: PermissionMode): void {
    this.rules.set(pattern, mode);
    this.save();
  }

  /**
   * Remove a permission rule
   */
  removeMode(pattern: string): void {
    this.rules.delete(pattern);
    this.save();
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules.clear();
    this.save();
  }

  /**
   * Get all rules
   */
  getAllRules(): Map<string, PermissionMode> {
    return new Map(this.rules);
  }

  /**
   * Add to history
   */
  addToHistory(result: PermissionResult): void {
    this.history.push(result);
    // Keep only last 100 entries
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  /**
   * Get history
   */
  getHistory(): PermissionResult[] {
    return [...this.history];
  }

  /**
   * Save rules to disk (best-effort)
   */
  save(): void {
    if (!this.persistPath) return;
    try {
      const data = Object.fromEntries(this.rules.entries());
      const dir = this.persistPath.substring(0, this.persistPath.lastIndexOf('/'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(this.persistPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    } catch {
      // Persistence is best-effort
    }
  }

  /**
   * Load rules from disk (best-effort)
   */
  load(): void {
    if (!this.persistPath) return;
    try {
      if (!existsSync(this.persistPath)) return;
      const raw = readFileSync(this.persistPath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, PermissionMode>;
      for (const [pattern, mode] of Object.entries(data)) {
        this.rules.set(pattern, mode);
      }
    } catch {
      // Loading is best-effort
    }
  }
}

// Global permission store
const permissionStore = new PermissionStore();

/**
 * Initialize permission persistence (set file path and load existing rules)
 */
export function initPermissionPersistence(filePath: string): void {
  permissionStore.setPersistPath(filePath);
  permissionStore.load();
}

/**
 * Get the global permission store (for testing)
 */
export function getPermissionStore(): PermissionStore {
  return permissionStore;
}

// ============================================================================
// Permission Functions
// ============================================================================

/**
 * Get permission mode for a command
 */
export function getPermissionMode(command: string): PermissionMode {
  const baseCommand = getCommandPattern(command);

  // Check user-defined rules first
  const userMode = permissionStore.getMode(baseCommand);
  if (userMode) {
    return userMode;
  }

  // Check built-in rules
  for (const rule of BUILT_IN_RULES) {
    if (rule.pattern.test(command)) {
      return rule.mode;
    }
  }

  // Fall back to command classification
  const classification = classifyCommand(command);
  return getClassificationMode(classification);
}

/**
 * Get permission mode based on command classification
 */
export function getClassificationMode(classification: CommandClassification): PermissionMode {
  switch (classification) {
    case 'read':
      return 'bypass';
    case 'write':
      return 'ask';
    case 'unknown':
      return 'ask';
    default:
      return 'ask';
  }
}

/**
 * Create a pattern for matching similar commands
 */
export function getCommandPattern(command: string): string {
  const parts = command.trim().split(/\s+/);
  const baseCommand = parts[0]?.toLowerCase() || '';

  // For commands with subcommands (git, docker, etc.)
  if (parts.length > 1) {
    return `${baseCommand} ${parts[1].toLowerCase()}`;
  }

  return baseCommand;
}

/**
 * Check if a command requires user confirmation
 */
export function requiresConfirmation(command: string): boolean {
  const mode = getPermissionMode(command);
  return mode === 'ask';
}

/**
 * Check if a command is allowed
 */
export function isAllowed(command: string): boolean {
  const mode = getPermissionMode(command);
  return PERMISSION_MODE_BEHAVIORS[mode].allows;
}

/**
 * Set permission mode for a command pattern
 */
export function setPermissionMode(pattern: string, mode: PermissionMode): void {
  permissionStore.setMode(pattern, mode);
}

/**
 * Remove a permission rule
 */
export function removePermissionMode(pattern: string): void {
  permissionStore.removeMode(pattern);
}

/**
 * Clear all permission rules
 */
export function clearPermissionRules(): void {
  permissionStore.clear();
}

/**
 * Check permission and return result
 */
export function checkPermission(command: string): PermissionResult {
  const mode = getPermissionMode(command);
  const info = getCommandInfo(command);

  const result: PermissionResult = {
    allowed: PERMISSION_MODE_BEHAVIORS[mode].allows,
    mode,
    reason: getPermissionReason(command, mode),
    suggestions: mode === 'ask' ? getSuggestions(command) : undefined,
  };

  permissionStore.addToHistory(result);

  return result;
}

/**
 * Get human-readable reason for permission decision
 */
export function getPermissionReason(command: string, mode: PermissionMode): string {
  const baseCommand = getCommandPattern(command);

  switch (mode) {
    case 'bypass':
      return `Allowed (${baseCommand} is read-only)`;
    case 'allow':
      return `Allowed (user permission)`;
    case 'ask':
      return `Requires user confirmation`;
    case 'deny':
      return `Blocked (potentially dangerous)`;
    default:
      return `Unknown mode: ${mode}`;
  }
}

/**
 * Get permission suggestions for a command
 */
export function getSuggestions(command: string): PermissionSuggestion[] {
  const baseCommand = getCommandPattern(command);

  return [
    {
      pattern: baseCommand,
      mode: 'allow',
      label: `Always allow "${baseCommand}"`,
    },
    {
      pattern: baseCommand.split(' ')[0],
      mode: 'allow',
      label: `Always allow "${baseCommand.split(' ')[0]}" and subcommands`,
    },
  ];
}

/**
 * Create permission request for user prompt
 */
export function createPermissionRequest(command: string): PermissionRequest {
  const classification = classifyCommand(command);
  const suggestions = getSuggestions(command);

  return {
    command,
    classification,
    reason: getPermissionReason(command, 'ask'),
    suggestions,
  };
}

/**
 * Format permission request as user prompt
 */
export function formatPermissionPrompt(request: PermissionRequest): string {
  const lines: string[] = [];

  lines.push('⚠️  Permission Required');
  lines.push('');
  lines.push(`Command: \`${request.command}\``);
  lines.push(`Type: ${request.classification}`);
  lines.push(`Reason: ${request.reason}`);
  lines.push('');

  if (request.classification === 'write') {
    lines.push('This command will modify files or system state.');
  }

  lines.push('Allow this command?');
  lines.push('');
  lines.push('Options:');
  lines.push('  1. Allow (this time only)');
  lines.push('  2. Always allow this command');
  lines.push('  3. Always allow similar commands');
  lines.push('  4. Deny (this time only)');
  lines.push('  5. Always deny');
  lines.push('');
  lines.push('Or enter your choice:');

  return lines.join('\n');
}

/**
 * Parse user response to permission prompt
 */
export function parsePermissionResponse(
  response: string
): { allowed: boolean; mode: PermissionMode; setRule: boolean } | null {
  const lower = response.toLowerCase().trim();

  switch (lower) {
    case '1':
    case 'allow':
    case 'yes':
    case 'y':
      return { allowed: true, mode: 'ask', setRule: false };
    case '2':
    case 'always':
    case 'always allow':
      return { allowed: true, mode: 'allow', setRule: true };
    case '3':
    case 'similar':
    case 'similar commands':
      return { allowed: true, mode: 'allow', setRule: true };
    case '4':
    case 'deny':
    case 'no':
    case 'n':
      return { allowed: false, mode: 'ask', setRule: false };
    case '5':
    case 'always deny':
    case 'never':
      return { allowed: false, mode: 'deny', setRule: true };
    case '':
    case 'skip':
    case 'cancel':
      return null;
    default:
      return null;
  }
}

// ============================================================================
// Module exports
// ============================================================================

export const permissionMode = {
  getPermissionMode,
  requiresConfirmation,
  isAllowed,
  setPermissionMode,
  removePermissionMode,
  clearPermissionRules,
  checkPermission,
  createPermissionRequest,
  formatPermissionPrompt,
  parsePermissionResponse,
  PERMISSION_MODE_BEHAVIORS,
  DEFAULT_PERMISSION_MODE,
};
