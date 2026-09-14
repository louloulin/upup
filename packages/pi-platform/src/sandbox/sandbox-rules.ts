/**
 * Sandbox Rules System
 *
 * Provides pattern-based permission rules for sandboxed operations.
 * Supports glob patterns for matching file paths and directory access.
 *
 * Part of Plan17 Phase 4 implementation.
 */

export type RuleType = 'allow' | 'deny';
export type RuleScope = 'read' | 'write' | 'execute';

export interface SandboxRule {
  /** Rule type: allow or deny */
  type: RuleType;
  /** Glob pattern for matching paths (e.g., "*.js", "src/**", "/etc/**") */
  pattern: string;
  /** Optional: scope this rule applies to (default: all scopes) */
  scope?: RuleScope;
  /** Optional: tool name this rule applies to (default: all tools) */
  tool?: string;
  /** Description for logging/debugging */
  description?: string;
}

export interface SandboxRuleSet {
  /** Rules for read operations */
  read?: SandboxRule[];
  /** Rules for write operations */
  write?: SandboxRule[];
  /** Rules for execute operations */
  execute?: SandboxRule[];
}

/**
 * Compile a glob pattern to a RegExp.
 * Supports: *, **, ?, [abc], [!abc]
 */
export function compileGlobPattern(pattern: string): RegExp {
  // Escape special regex chars except glob wildcards
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert glob patterns to regex
  // ** matches anything including /
  regex = regex.replace(/\*\*/g, '.*');
  // * matches anything except /
  regex = regex.replace(/\*/g, '[^/]*');
  // ? matches single char except /
  regex = regex.replace(/\?/g, '[^/]');

  // Handle character classes: [abc] and [!abc]
  regex = regex.replace(/\[!/, '[^');
  // Note: simple character classes like [abc] are already valid regex

  return new RegExp(`^${regex}$`);
}

/**
 * Check if a path matches a rule's pattern.
 */
export function matchesPattern(path: string, rule: SandboxRule): boolean {
  try {
    const regex = compileGlobPattern(rule.pattern);
    return regex.test(path);
  } catch {
    return false;
  }
}

/**
 * Check if a path matches any rule in a list.
 */
export function matchesAnyRule(path: string, rules: SandboxRule[]): boolean {
  for (const rule of rules) {
    if (matchesPattern(path, rule)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate access decision for a path.
 *
 * Rules are evaluated in order:
 * - Deny rules take precedence over allow rules
 * - Last matching rule wins
 *
 * @param path - The path to check
 * @param scope - The operation scope (read/write/execute)
 * @param tool - Optional tool name for tool-specific rules
 * @param rules - The rule set to evaluate against
 * @returns true if access is allowed, false if denied
 */
export function evaluateAccess(
  path: string,
  scope: RuleScope,
  rules: SandboxRule[],
): boolean {
  let decision: boolean = true; // Default allow
  let matchedRule: SandboxRule | null = null;

  for (const rule of rules) {
    // Skip rules that don't match the scope
    if (rule.scope && rule.scope !== scope) {
      continue;
    }

    // Skip rules that don't match the tool
    if (rule.tool && rule.tool !== '*') {
      continue;
    }

    // Check pattern match
    if (matchesPattern(path, rule)) {
      decision = rule.type === 'allow';
      matchedRule = rule;
    }
  }

  return decision;
}

/**
 * Default sandbox rules for common scenarios.
 */
export const DEFAULT_SANDBOX_RULES: SandboxRuleSet = {
  read: [
    // Allow reading source files
    { type: 'allow', pattern: '**/*.ts', scope: 'read', description: 'TypeScript source files' },
    { type: 'allow', pattern: '**/*.js', scope: 'read', description: 'JavaScript files' },
    { type: 'allow', pattern: '**/*.json', scope: 'read', description: 'JSON files' },
    { type: 'allow', pattern: '**/*.md', scope: 'read', description: 'Markdown files' },

    // Allow reading config files
    { type: 'allow', pattern: '**/.upup/**', scope: 'read', description: 'UpUp config directory' },
    { type: 'allow', pattern: '**/node_modules/**', scope: 'read', description: 'Dependencies' },
  ],
  write: [
    // Allow writing to source directories
    { type: 'allow', pattern: 'src/**', scope: 'write', description: 'Source directory' },
    { type: 'allow', pattern: 'lib/**', scope: 'write', description: 'Library directory' },
    { type: 'allow', pattern: '**/*.test.ts', scope: 'write', description: 'Test files' },

    // Deny writing to sensitive directories
    { type: 'deny', pattern: '/etc/**', scope: 'write', description: 'System config' },
    { type: 'deny', pattern: '/var/**', scope: 'write', description: 'System data' },
    { type: 'deny', pattern: '~/.ssh/**', scope: 'write', description: 'SSH keys' },
  ],
  execute: [
    // Allow executing build tools
    { type: 'allow', pattern: '**/node_modules/.bin/**', scope: 'execute', description: 'npm binaries' },
    { type: 'allow', pattern: '**/bin/**', scope: 'execute', description: 'System bin' },
  ],
};

/**
 * Sandbox rules manager for loading, saving, and evaluating rules.
 */
export class SandboxRulesManager {
  private rules: SandboxRuleSet;
  private static instance: SandboxRulesManager | null = null;

  private constructor() {
    this.rules = { ...DEFAULT_SANDBOX_RULES };
  }

  static getInstance(): SandboxRulesManager {
    if (!SandboxRulesManager.instance) {
      SandboxRulesManager.instance = new SandboxRulesManager();
    }
    return SandboxRulesManager.instance;
  }

  /**
   * Get all rules.
   */
  getRules(): SandboxRuleSet {
    return { ...this.rules };
  }

  /**
   * Set rules from external source (file, config, etc.)
   */
  setRules(rules: SandboxRuleSet): void {
    this.rules = { ...rules };
  }

  /**
   * Add a single rule to a scope.
   */
  addRule(rule: SandboxRule): void {
    const scope = rule.scope || 'read';
    if (!this.rules[scope]) {
      this.rules[scope] = [];
    }
    this.rules[scope]!.push(rule);
  }

  /**
   * Remove a rule by pattern.
   */
  removeRule(pattern: string, scope?: RuleScope): void {
    if (scope) {
      this.rules[scope] = this.rules[scope]?.filter(r => r.pattern !== pattern);
    } else {
      // Remove from all scopes
      for (const key of Object.keys(this.rules) as RuleScope[]) {
        this.rules[key] = this.rules[key]?.filter(r => r.pattern !== pattern);
      }
    }
  }

  /**
   * Check if access is allowed for a path.
   */
  isAllowed(path: string, scope: RuleScope, tool?: string): boolean {
    const scopeRules = this.rules[scope] || [];
    const allRules = [
      ...scopeRules,
      // Also check read rules for all scopes (fallback)
      ...(scope !== 'read' ? (this.rules.read || []) : []),
    ];

    // Filter rules by tool if specified
    const filteredRules = allRules.filter(r => !r.tool || r.tool === '*' || r.tool === tool);

    // Evaluate: last matching rule wins
    let decision = true;
    for (const rule of filteredRules) {
      if (matchesPattern(path, rule)) {
        decision = rule.type === 'allow';
      }
    }

    return decision;
  }

  /**
   * Reset rules to defaults.
   */
  reset(): void {
    this.rules = { ...DEFAULT_SANDBOX_RULES };
  }

  /**
   * Get rules as JSON for serialization.
   */
  toJSON(): string {
    return JSON.stringify(this.rules, null, 2);
  }

  /**
   * Load rules from JSON string.
   */
  fromJSON(json: string): void {
    try {
      const parsed = JSON.parse(json);
      this.rules = parsed;
    } catch {
      // Invalid JSON, keep existing rules
    }
  }
}

// Export singleton accessor
export function getSandboxRulesManager(): SandboxRulesManager {
  return SandboxRulesManager.getInstance();
}