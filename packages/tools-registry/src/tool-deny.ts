/**
 * Tool Deny Rules - Loucode-style tool filtering and denial
 *
 * Features:
 * - Tool deny list management
 * - Pattern-based tool denial
 * - Tool category filtering
 * - Dangerous tool detection
 *
 * Reference: Loucode's tool deny rules
 */

import { warn, info } from '@upup/utils/logging/logger';

// ============================================================================
// Deny Rule Types
// ============================================================================

/**
 * Tool deny reason
 */
export type ToolDenyReason =
  | 'dangerous'
  | 'experimental'
  | 'deprecated'
  | 'unstable'
  | 'requires_admin'
  | 'custom';

/**
 * Tool deny rule
 */
export interface ToolDenyRule {
  /** Unique rule identifier */
  id: string;
  /** Tool name pattern (supports wildcards) */
  pattern: string | RegExp;
  /** Reason for denial */
  reason: ToolDenyReason;
  /** Detailed description */
  description: string;
  /** Whether to warn only (allow with warning) */
  warnOnly?: boolean;
  /** Priority (higher = checked first) */
  priority: number;
}

/**
 * Denial result
 */
export interface ToolDenyResult {
  /** Whether tool should be denied */
  denied: boolean;
  /** Rule that triggered denial */
  rule?: ToolDenyRule;
  /** Whether to allow with warning */
  warnOnly?: boolean;
  /** Reason for denial */
  reason?: string;
}

// ============================================================================
// Built-in Deny Rules
// ============================================================================

/**
 * Dangerous tools that should always be denied
 */
export const DANGEROUS_TOOLS: string[] = [
  'format_disk',
  'rm_rf',
  'sudo',
  'chmod_777',
  'delete_all_files',
  'drop_database',
];

/**
 * Experimental tools (may be unstable)
 */
export const EXPERIMENTAL_TOOLS: string[] = [
  'experimental_ai',
  'beta_feature',
];

/**
 * Deprecated tools
 */
export const DEPRECATED_TOOLS: string[] = [
  'old_tool_v1',
  'legacy_api',
];

/**
 * Built-in deny rules
 */
export const TOOL_DENY_RULES: ToolDenyRule[] = [
  // Dangerous tools - always block
  ...DANGEROUS_TOOLS.map(tool => ({
    id: `dangerous-${tool}`,
    pattern: tool,
    reason: 'dangerous' as ToolDenyReason,
    description: `Tool ${tool} is dangerous and blocked`,
    warnOnly: false,
    priority: 100,
  })),

  // Experimental tools - warn only
  ...EXPERIMENTAL_TOOLS.map(tool => ({
    id: `experimental-${tool}`,
    pattern: tool,
    reason: 'experimental' as ToolDenyReason,
    description: `Tool ${tool} is experimental and may be unstable`,
    warnOnly: true,
    priority: 50,
  })),

  // Deprecated tools - warn only
  ...DEPRECATED_TOOLS.map(tool => ({
    id: `deprecated-${tool}`,
    pattern: tool,
    reason: 'deprecated' as ToolDenyReason,
    description: `Tool ${tool} is deprecated, use alternatives`,
    warnOnly: true,
    priority: 40,
  })),

  // Pattern-based rules
  {
    id: 'dangerous-wildcard',
    pattern: /^(rm|del|delete|format)_.*(all|everything|recursive)/i,
    reason: 'dangerous',
    description: 'Recursive delete operations are dangerous',
    warnOnly: false,
    priority: 90,
  },
  {
    id: 'dangerous-system',
    pattern: /^(sys|system|kernel|boot).*/i,
    reason: 'dangerous',
    description: 'System-level operations are dangerous',
    warnOnly: false,
    priority: 95,
  },
  {
    id: 'dangerous-network',
    pattern: /^(nc|netcat|nmap)/i,
    reason: 'dangerous',
    description: 'Network probing tools may be dangerous',
    warnOnly: false,
    priority: 80,
  },
];

// ============================================================================
// Tool Deny Manager
// ============================================================================

/**
 * Manager for tool denial rules
 */
export class ToolDenyManager {
  private rules: ToolDenyRule[];
  private denyLog: Array<{
    toolName: string;
    rule: ToolDenyRule;
    timestamp: number;
  }>;

  constructor(customRules?: ToolDenyRule[]) {
    this.rules = [...TOOL_DENY_RULES, ...(customRules || [])];
    // Sort by priority (highest first)
    this.rules.sort((a, b) => b.priority - a.priority);
    this.denyLog = [];
  }

  /**
   * Check if tool should be denied
   */
  check(toolName: string): ToolDenyResult {
    for (const rule of this.rules) {
      const matches = this.matchesPattern(toolName, rule.pattern);

      if (matches) {
        // Log if not warn-only
        if (!rule.warnOnly) {
          warn('tools', `Tool denied: ${toolName} by rule ${rule.id}`);
          this.denyLog.push({
            toolName,
            rule,
            timestamp: Date.now(),
          });
        }

        return {
          denied: !rule.warnOnly,
          rule,
          warnOnly: rule.warnOnly,
          reason: rule.description,
        };
      }
    }

    return { denied: false };
  }

  /**
   * Check if tool name matches pattern
   */
  private matchesPattern(toolName: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(toolName);
    }

    // Support wildcards
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        'i'
      );
      return regex.test(toolName);
    }

    return toolName.toLowerCase() === pattern.toLowerCase();
  }

  /**
   * Check multiple tools
   */
  checkMultiple(toolNames: string[]): Map<string, ToolDenyResult> {
    const results = new Map<string, ToolDenyResult>();

    for (const toolName of toolNames) {
      results.set(toolName, this.check(toolName));
    }

    return results;
  }

  /**
   * Filter tools based on deny rules
   */
  filterTools(
    toolNames: string[],
    options?: { allowWarnings?: boolean }
  ): {
    allowed: string[];
    denied: string[];
    warned: string[];
  } {
    const allowed: string[] = [];
    const denied: string[] = [];
    const warned: string[] = [];

    for (const toolName of toolNames) {
      const result = this.check(toolName);

      if (result.denied) {
        denied.push(toolName);
      } else if (result.warnOnly && !options?.allowWarnings) {
        warned.push(toolName);
      } else {
        allowed.push(toolName);
      }
    }

    return { allowed, denied, warned };
  }

  /**
   * Add custom rule
   */
  addRule(rule: ToolDenyRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove rule by ID
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): ToolDenyRule[] {
    return [...this.rules];
  }

  /**
   * Get denial log
   */
  getDenialLog(): Array<{
    toolName: string;
    rule: ToolDenyRule;
    timestamp: number;
  }> {
    return [...this.denyLog];
  }

  /**
   * Clear denial log
   */
  clearDenialLog(): void {
    this.denyLog = [];
  }

  /**
   * Check if tool is dangerous
   */
  isDangerous(toolName: string): boolean {
    return DANGEROUS_TOOLS.some(d =>
      toolName.toLowerCase() === d.toLowerCase()
    );
  }

  /**
   * Check if tool is experimental
   */
  isExperimental(toolName: string): boolean {
    return EXPERIMENTAL_TOOLS.some(e =>
      toolName.toLowerCase() === e.toLowerCase()
    );
  }

  /**
   * Check if tool is deprecated
   */
  isDeprecated(toolName: string): boolean {
    return DEPRECATED_TOOLS.some(d =>
      toolName.toLowerCase() === d.toLowerCase()
    );
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let toolDenyManager: ToolDenyManager | null = null;

export function getToolDenyManager(): ToolDenyManager {
  if (!toolDenyManager) {
    toolDenyManager = new ToolDenyManager();
  }
  return toolDenyManager;
}

export function resetToolDenyManager(): void {
  toolDenyManager = null;
}

/**
 * Quick check if tool is denied
 */
export function isToolDenied(toolName: string): boolean {
  return getToolDenyManager().check(toolName).denied;
}

/**
 * Get denial reason for tool
 */
export function getToolDenialReason(toolName: string): string | undefined {
  const result = getToolDenyManager().check(toolName);
  return result.denied ? result.reason : undefined;
}

// ============================================================================
// Module Exports
// ============================================================================

export const toolDeny = {
  ToolDenyManager,
  TOOL_DENY_RULES,
  DANGEROUS_TOOLS,
  EXPERIMENTAL_TOOLS,
  DEPRECATED_TOOLS,
  getToolDenyManager,
  resetToolDenyManager,
  isToolDenied,
  getToolDenialReason,
};
