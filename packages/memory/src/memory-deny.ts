/**
 * Memory Deny Rules - Loucode-style memory deny list enforcement
 *
 * Features:
 * - Deny rules that prevent saving certain types of memories
 * - Pattern-based denial
 * - Category-based denial
 * - Denial audit trail
 *
 * Reference: Loucode's memoryTypes.ts denial rules
 */

import { warn, info } from '../utils/logging/logger.js';

// ============================================================================
// Deny Rule Types
// ============================================================================

/**
 * Memory deny categories
 */
export type MemoryDenyCategory =
  | 'code_pattern'
  | 'git_content'
  | 'debug_info'
  | 'ephemeral'
  | 'sensitive'
  | 'redundant'
  | 'obvious';

/**
 * Memory deny rule
 */
export interface MemoryDenyRule {
  /** Unique rule identifier */
  id: string;
  /** Rule description */
  description: string;
  /** Category of denial */
  category: MemoryDenyCategory;
  /** Pattern to match */
  pattern: RegExp;
  /** Priority (higher = checked first) */
  priority: number;
  /** Whether to log denial */
  logDenial: boolean;
}

/**
 * Denial result
 */
export interface MemoryDenyResult {
  /** Whether memory should be denied */
  denied: boolean;
  /** Rule that denied (if denied) */
  rule?: MemoryDenyRule;
  /** Reason for denial */
  reason?: string;
}

// ============================================================================
// Built-in Deny Rules
// ============================================================================

/**
 * Loucode's deny rules for memory saving
 */
export const MEMORY_DENY_RULES: MemoryDenyRule[] = [
  // Code patterns - never save code, it's in the source
  {
    id: 'code-function',
    description: 'Function definitions should not be memorized',
    category: 'code_pattern',
    pattern: /^(export\s+)?(async\s+)?function\s+\w+\s*\(/m,
    priority: 100,
    logDenial: false,
  },
  {
    id: 'code-class',
    description: 'Class definitions should not be memorized',
    category: 'code_pattern',
    pattern: /^(export\s+)?class\s+\w+/m,
    priority: 100,
    logDenial: false,
  },
  {
    id: 'code-interface',
    description: 'Interface definitions should not be memorized',
    category: 'code_pattern',
    pattern: /^(export\s+)?interface\s+\w+/m,
    priority: 100,
    logDenial: false,
  },
  {
    id: 'code-type',
    description: 'Type definitions should not be memorized',
    category: 'code_pattern',
    pattern: /^(export\s+)?type\s+\w+\s*=/m,
    priority: 100,
    logDenial: false,
  },
  {
    id: 'code-import',
    description: 'Import statements should not be memorized',
    category: 'code_pattern',
    pattern: /^import\s+.*from\s+['"`]/m,
    priority: 100,
    logDenial: false,
  },
  {
    id: 'code-export',
    description: 'Export statements should not be memorized',
    category: 'code_pattern',
    pattern: /^export\s+(default\s+)?(const|let|var|function|class)/m,
    priority: 100,
    logDenial: false,
  },
  {
    id: 'code-regex',
    description: 'Regex patterns are code',
    category: 'code_pattern',
    pattern: /^\s*\/.*\/[gimsuy]*\s*[;,]?\s*$/m,
    priority: 90,
    logDenial: false,
  },

  // Git content - should use git commands, not memorize
  {
    id: 'git-log',
    description: 'Git log output should not be memorized',
    category: 'git_content',
    pattern: /^[a-f0-9]{7,40}\s+.*/m,
    priority: 80,
    logDenial: false,
  },
  {
    id: 'git-blame',
    description: 'Git blame output should not be memorized',
    category: 'git_content',
    pattern: /^\d+\)\s+.*\d{4}-\d{2}-\d{2}/m,
    priority: 80,
    logDenial: false,
  },
  {
    id: 'git-sha',
    description: 'Git SHA should not be memorized',
    category: 'git_content',
    pattern: /\b[a-f0-9]{40}\b/,
    priority: 70,
    logDenial: false,
  },

  // Debug info - fixes are in code, not memory
  {
    id: 'debug-stack',
    description: 'Stack traces should not be memorized',
    category: 'debug_info',
    pattern: /^at\s+\w+\s*\(.*:\d+:\d+\)/m,
    priority: 90,
    logDenial: false,
  },
  {
    id: 'debug-error',
    description: 'Error messages with stack traces',
    category: 'debug_info',
    pattern: /(Error|Exception|Traceback):/i,
    priority: 80,
    logDenial: false,
  },

  // Ephemeral content - one-time or temporary
  {
    id: 'ephemeral-temp',
    description: 'Temporary one-time information',
    category: 'ephemeral',
    pattern: /(temporary|ephemeral|one-time|disposable)/i,
    priority: 70,
    logDenial: false,
  },
  {
    id: 'ephemeral-session',
    description: 'Session-specific information',
    category: 'ephemeral',
    pattern: /^session[:\s]+\w+/i,
    priority: 60,
    logDenial: false,
  },

  // Sensitive content - never memorize
  {
    id: 'sensitive-password',
    description: 'Passwords should never be memorized',
    category: 'sensitive',
    pattern: /(password|passwd|pwd)\s*[:=]\s*\S+/i,
    priority: 100,
    logDenial: true,
  },
  {
    id: 'sensitive-api-key',
    description: 'API keys should never be memorized',
    category: 'sensitive',
    pattern: /(api[_-]?key|secret|token)\s*[:=]\s*['"]?\w{8,}/i,
    priority: 100,
    logDenial: true,
  },
  {
    id: 'sensitive-token',
    description: 'Bearer tokens should never be memorized',
    category: 'sensitive',
    pattern: /bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/i,
    priority: 100,
    logDenial: true,
  },
  {
    id: 'sensitive-private-key',
    description: 'Private keys should never be memorized',
    category: 'sensitive',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    priority: 100,
    logDenial: true,
  },

  // Redundant content - already in project files
  {
    id: 'redundant-claude-md',
    description: 'Content already in CLAUDE.md',
    category: 'redundant',
    pattern: /^#.*claude.*md/im,
    priority: 50,
    logDenial: false,
  },
  {
    id: 'redundant-readme',
    description: 'README content is in the project',
    category: 'redundant',
    pattern: /^#\s+\w+\s+\w+\s+project/im,
    priority: 50,
    logDenial: false,
  },

  // Obvious content - self-evident information
  {
    id: 'obvious-todo',
    description: 'TODO comments are code',
    category: 'obvious',
    pattern: /^\s*(\/\/|#|<!--)\s*TODO[:\s]/m,
    priority: 40,
    logDenial: false,
  },
  {
    id: 'obvious-fixme',
    description: 'FIXME comments are code',
    category: 'obvious',
    pattern: /^\s*(\/\/|#|<!--)\s*FIXME[:\s]/m,
    priority: 40,
    logDenial: false,
  },
];

// ============================================================================
// Memory Deny Manager
// ============================================================================

/**
 * Memory deny manager for checking content against rules
 */
export class MemoryDenyManager {
  private rules: MemoryDenyRule[];
  private denialLog: Array<{
    content: string;
    rule: MemoryDenyRule;
    timestamp: number;
  }>;

  constructor(customRules?: MemoryDenyRule[]) {
    this.rules = [...MEMORY_DENY_RULES, ...(customRules || [])];
    // Sort by priority (highest first)
    this.rules.sort((a, b) => b.priority - a.priority);
    this.denialLog = [];
  }

  /**
   * Check if content should be denied
   */
  check(content: string): MemoryDenyResult {
    for (const rule of this.rules) {
      if (rule.pattern.test(content)) {
        // Log denial if configured
        if (rule.logDenial) {
          warn('memory', `Memory denied by rule ${rule.id}: ${rule.description}`);
          this.denialLog.push({
            content: content.slice(0, 100),
            rule,
            timestamp: Date.now(),
          });
        }

        return {
          denied: true,
          rule,
          reason: rule.description,
        };
      }
    }

    return { denied: false };
  }

  /**
   * Check multiple content items
   */
  checkMultiple(contents: string[]): Map<string, MemoryDenyResult> {
    const results = new Map<string, MemoryDenyResult>();

    for (const content of contents) {
      results.set(content, this.check(content));
    }

    return results;
  }

  /**
   * Filter out denied contents
   */
  filterDenials(contents: string[]): {
    allowed: string[];
    denied: Array<{ content: string; result: MemoryDenyResult }>;
  } {
    const allowed: string[] = [];
    const denied: Array<{ content: string; result: MemoryDenyResult }> = [];

    for (const content of contents) {
      const result = this.check(content);
      if (result.denied) {
        denied.push({ content, result });
      } else {
        allowed.push(content);
      }
    }

    return { allowed, denied };
  }

  /**
   * Add custom rule
   */
  addRule(rule: MemoryDenyRule): void {
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
   * Get denial log
   */
  getDenialLog(): Array<{
    content: string;
    rule: MemoryDenyRule;
    timestamp: number;
  }> {
    return [...this.denialLog];
  }

  /**
   * Clear denial log
   */
  clearDenialLog(): void {
    this.denialLog = [];
  }

  /**
   * Get all rules
   */
  getRules(): MemoryDenyRule[] {
    return [...this.rules];
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: MemoryDenyCategory): MemoryDenyRule[] {
    return this.rules.filter(r => r.category === category);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let denyManager: MemoryDenyManager | null = null;

export function getMemoryDenyManager(): MemoryDenyManager {
  if (!denyManager) {
    denyManager = new MemoryDenyManager();
  }
  return denyManager;
}

export function resetMemoryDenyManager(): void {
  denyManager = null;
}

/**
 * Quick check if content should be denied
 */
export function isMemoryDenied(content: string): boolean {
  return getMemoryDenyManager().check(content).denied;
}

/**
 * Get denial reason if content is denied
 */
export function getDenialReason(content: string): string | undefined {
  const result = getMemoryDenyManager().check(content);
  return result.denied ? result.reason : undefined;
}

// ============================================================================
// Module Exports
// ============================================================================

export const memoryDeny = {
  MemoryDenyManager,
  MEMORY_DENY_RULES,
  getMemoryDenyManager,
  resetMemoryDenyManager,
  isMemoryDenied,
  getDenialReason,
};
