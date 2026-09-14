/**
 * Permission System - Enhanced tool approval and auto-approval
 *
 * Provides:
 * - Permission rules for automatic tool approval/denial
 * - Bash command classification
 * - Auto-approve patterns
 * - Session-level permission management
 * - MCP tool rules support
 * - Path protection rules
 * - Rule import/export
 */

import type { ApprovalDecision } from '@upup/pi-event-adapter';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { upupPath } from '../utils/paths.js';

// ============================================================================
// Permission Rules
// ============================================================================

/**
 * Represents a permission rule pattern
 */
export interface PermissionRule {
  /** Unique rule identifier */
  id: string;
  /** Tool name or pattern (supports * wildcard) */
  toolPattern: string;
  /** Regex pattern to match tool arguments */
  argsPattern?: RegExp;
  /** Decision for matching tools */
  decision: ApprovalDecision;
  /** Human-readable description */
  description: string;
  /** Risk level of this rule */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Whether this rule is enabled */
  enabled: boolean;
}

/**
 * Predefined safe patterns for auto-approval
 */
export const SAFE_PATTERNS: PermissionRule[] = [
  // Read-only file operations
  {
    id: 'safe-read',
    toolPattern: 'read_file',
    decision: 'allow-once',
    description: 'Read-only file access',
    riskLevel: 'low',
    enabled: true,
  },
  // Web search operations
  {
    id: 'safe-search',
    toolPattern: '*_search',
    decision: 'allow-once',
    description: 'Web search operations',
    riskLevel: 'low',
    enabled: true,
  },
  {
    id: 'safe-fetch',
    toolPattern: 'web_fetch',
    decision: 'allow-once',
    description: 'Web content fetching',
    riskLevel: 'low',
    enabled: true,
  },
  // Memory operations
  {
    id: 'safe-memory',
    toolPattern: 'memory_*',
    decision: 'allow-once',
    description: 'Memory read/search operations',
    riskLevel: 'low',
    enabled: true,
  },
  // Plan mode operations
  {
    id: 'safe-plan',
    toolPattern: '*_plan*',
    decision: 'allow-once',
    description: 'Plan mode tools',
    riskLevel: 'low',
    enabled: true,
  },
  // List/info operations
  {
    id: 'safe-list',
    toolPattern: 'list_*',
    decision: 'allow-once',
    description: 'List operations',
    riskLevel: 'low',
    enabled: true,
  },
];

/**
 * Dangerous patterns that should always require approval
 */
export const DANGEROUS_PATTERNS: PermissionRule[] = [
  // File deletion
  {
    id: 'dangerous-delete',
    toolPattern: 'delete_*',
    decision: 'deny',
    description: 'File deletion operations - always require approval',
    riskLevel: 'critical',
    enabled: true,
  },
  // Shell execution
  {
    id: 'dangerous-shell',
    toolPattern: 'shell',
    argsPattern: /rm\s+-rf|sudo|chmod\s+777|mkfs/,
    decision: 'deny',
    description: 'Potentially destructive shell commands',
    riskLevel: 'critical',
    enabled: true,
  },
  // Write operations
  {
    id: 'dangerous-write',
    toolPattern: 'write_file',
    argsPattern: /\.env$|credentials|secret|password|key/i,
    decision: 'deny',
    description: 'Writing sensitive files',
    riskLevel: 'high',
    enabled: true,
  },
];

/**
 * Medium-risk patterns that require explicit approval
 */
export const MEDIUM_RISK_PATTERNS: PermissionRule[] = [
  // Edit operations
  {
    id: 'medium-edit',
    toolPattern: 'edit_file',
    decision: 'allow-session',
    description: 'File editing requires confirmation',
    riskLevel: 'medium',
    enabled: true,
  },
  // Write operations (non-sensitive)
  {
    id: 'medium-write',
    toolPattern: 'write_file',
    decision: 'allow-session',
    description: 'File writing requires confirmation',
    riskLevel: 'medium',
    enabled: true,
  },
  // Bash execution
  {
    id: 'medium-bash',
    toolPattern: 'shell',
    decision: 'allow-session',
    description: 'Shell execution requires confirmation',
    riskLevel: 'medium',
    enabled: true,
  },
  // Subagent spawning
  {
    id: 'medium-agent',
    toolPattern: 'agent',
    decision: 'allow-session',
    description: 'Spawning agents requires confirmation',
    riskLevel: 'medium',
    enabled: true,
  },
];

// ============================================================================
// MCP Tool Rules
// ============================================================================

/**
 * MCP server configuration for permission rules
 */
export interface MCPServerRule {
  /** MCP server name (e.g., 'filesystem', 'github') */
  serverName: string;
  /** Allowed tool patterns (supports * wildcard) */
  allowedTools?: string[];
  /** Denied tool patterns (supports * wildcard) */
  deniedTools?: string[];
  /** Path restrictions for file-based MCP servers */
  allowedPaths?: string[];
  /** Denied path patterns (supports glob) */
  deniedPaths?: string[];
}

/**
 * MCP permission configuration
 */
export interface MCPPermissionConfig {
  /** Server-specific rules */
  servers: Record<string, MCPServerRule>;
  /** Default behavior for MCP tools */
  defaultDecision: ApprovalDecision;
}

/**
 * Default MCP server rules
 */
export const DEFAULT_MCP_RULES: MCPPermissionConfig = {
  servers: {
    // Filesystem MCP - restrict to project directory
    'filesystem': {
      serverName: 'filesystem',
      allowedTools: ['*'], // Allow all tools
      deniedTools: ['rm', 'delete'], // But deny deletion
      deniedPaths: [
        '**/.git/**',
        '**/.claude/**',
        '**/node_modules/**',
        '**/.env',
        '**/credentials*',
      ],
    },
    // GitHub MCP - read-only operations
    'github': {
      serverName: 'github',
      allowedTools: ['*'],
      deniedTools: ['delete_*', 'remove_*'],
    },
  },
  defaultDecision: 'allow-session', // Default: require approval
};

// ============================================================================
// Path Protection Rules
// ============================================================================

/**
 * Path protection configuration
 */
export interface PathProtectionConfig {
  /** Protected directory patterns (glob) */
  protectedPaths: string[];
  /** Allowed operations on protected paths */
  allowedOperations: ('read' | 'write' | 'delete')[];
  /** Whether to always deny modifications to protected paths */
  alwaysDeny: boolean;
}

/**
 * Default protected paths
 */
export const DEFAULT_PROTECTED_PATHS: PathProtectionConfig = {
  protectedPaths: [
    '**/.git/**',
    '**/.claude/**',
    '**/.env',
    '**/credentials*',
    '**/id_rsa*',
    '**/.ssh/**',
    '**/secrets/**',
    '**/keys/**',
    '**/password*',
    '**/.npmrc',
    '**/.pypirc',
    '**/.netrc',
  ],
  allowedOperations: ['read'], // Only read by default
  alwaysDeny: true, // Always deny modifications
};

/**
 * Check if a path matches a glob pattern
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  } catch {
    return false;
  }
}

/**
 * Check if a path is protected
 */
export function isPathProtected(path: string, config: PathProtectionConfig = DEFAULT_PROTECTED_PATHS): boolean {
  for (const protectedPath of config.protectedPaths) {
    if (matchesGlob(path, protectedPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate MCP tool permission
 */
export function evaluateMCPTool(
  serverName: string,
  toolName: string,
  args?: Record<string, unknown>,
  mcpConfig: MCPPermissionConfig = DEFAULT_MCP_RULES
): { allowed: boolean; reason: string } {
  const serverRule = mcpConfig.servers[serverName];

  // No specific rule for this server
  if (!serverRule) {
    return {
      allowed: mcpConfig.defaultDecision !== 'deny',
      reason: `No specific rule for MCP server '${serverName}' - using default`,
    };
  }

  // Check denied tools first
  if (serverRule.deniedTools) {
    for (const pattern of serverRule.deniedTools) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      if (new RegExp(`^${regexPattern}$`).test(toolName)) {
        return {
          allowed: false,
          reason: `Tool '${toolName}' denied by MCP server rule`,
        };
      }
    }
  }

  // Check allowed tools
  if (serverRule.allowedTools) {
    let allowed = false;
    for (const pattern of serverRule.allowedTools) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      if (new RegExp(`^${regexPattern}$`).test(toolName)) {
        allowed = true;
        break;
      }
    }

    if (!allowed) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' not in allowed tools for MCP server '${serverName}'`,
      };
    }
  }

  // Check path restrictions if applicable
  if (serverRule.deniedPaths && args?.path) {
    const path = String(args.path);
    for (const deniedPath of serverRule.deniedPaths) {
      if (matchesGlob(path, deniedPath)) {
        return {
          allowed: false,
          reason: `Path '${path}' denied by MCP server path restrictions`,
        };
      }
    }
  }

  return {
    allowed: true,
    reason: `Tool '${toolName}' allowed for MCP server '${serverName}'`,
  };
}

// ============================================================================
// Rule Import/Export
// ============================================================================

/**
 * Permission rules export format
 */
export interface PermissionRulesExport {
  version: string;
  exportedAt: string;
  customRules: PermissionRule[];
  mcpConfig: MCPPermissionConfig;
  pathProtection: PathProtectionConfig;
}

const PERMISSIONS_CONFIG_DIR = upupPath('config');
const PERMISSIONS_FILE = join(PERMISSIONS_CONFIG_DIR, 'permissions.json');

/**
 * Export permission rules to file
 */
export function exportPermissionRules(
  customRules: PermissionRule[],
  mcpConfig: MCPPermissionConfig = DEFAULT_MCP_RULES,
  pathProtection: PathProtectionConfig = DEFAULT_PROTECTED_PATHS
): string {
  const exportData: PermissionRulesExport = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    customRules,
    mcpConfig,
    pathProtection,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Save permission rules to config file
 */
export function savePermissionRules(
  customRules: PermissionRule[],
  mcpConfig?: MCPPermissionConfig,
  pathProtection?: PathProtectionConfig
): void {
  const data = exportPermissionRules(customRules, mcpConfig, pathProtection);

  try {
    if (!existsSync(PERMISSIONS_CONFIG_DIR)) {
      const { mkdirSync } = require('fs');
      mkdirSync(PERMISSIONS_CONFIG_DIR, { recursive: true });
    }
    writeFileSync(PERMISSIONS_FILE, data, 'utf-8');
  } catch (error) {
    console.error('Failed to save permission rules:', error);
  }
}

/**
 * Import permission rules from file
 */
export function importPermissionRules(filepath?: string): PermissionRulesExport | null {
  const filePath = filepath || PERMISSIONS_FILE;

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as PermissionRulesExport;

    // Validate basic structure
    if (!data.version || !data.customRules || !data.mcpConfig) {
      console.warn('Invalid permission rules file format');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to import permission rules:', error);
    return null;
  }
}

/**
 * Load custom rules from config file
 */
export function loadCustomRules(): PermissionRule[] {
  const imported = importPermissionRules();
  return imported?.customRules || [];
}

/**
 * Save current permission configuration
 */
export function saveCurrentPermissionConfig(
  customRules: PermissionRule[],
  mcpConfig?: MCPPermissionConfig,
  pathProtection?: PathProtectionConfig
): void {
  savePermissionRules(customRules, mcpConfig, pathProtection);
}

/**
 * Categories of bash commands
 */
export type BashCategory = 'read-only' | 'safe-modification' | 'destructive' | 'unknown';

/**
 * Classification result for a bash command
 */
export interface BashClassification {
  category: BashCategory;
  confidence: number; // 0-1
  reason: string;
}

/**
 * Bash command classification patterns
 */
const BASH_READ_ONLY_PATTERNS = [
  /^cat\s/,
  /^ls\s/,
  /^grep\s/,
  /^find\s/,
  /^head\s/,
  /^tail\s/,
  /^wc\s/,
  /^diff\s/,
  /^git\s+log\s/,
  /^git\s+show\s/,
  /^git\s+diff\s/,
  /^git\s+status\s/,
  /^git\s+branch\s/,
  /^git\s+remote\s/,
  /^curl\s+-s\s+/,
  /^curl\s+-I\s+/,
  /^ping\s/,
  /^which\s/,
  /^type\s/,
  /^ps\s/,
  /^df\s/,
  /^free\s/,
  /^uname\s/,
  /^echo\s/,
  /^pwd\s/,
  /^date\s/,
];

const BASH_SAFE_MODIFICATION_PATTERNS = [
  /^mkdir\s/,
  /^touch\s/,
  /^cp\s/,
  /^mv\s/,
  /^git\s+add\s/,
  /^git\s+commit\s/,
  /^git\s+checkout\s/,
  /^git\s+stash\s/,
  /^git\s+merge\s/,
  /^npm\s+(install|ls|outdated)\s/,
  /^bun\s+(install|ls|outdated)\s/,
  /^yarn\s+(install|ls)\s/,
  /^npm\s+run\s/,
  /^bun\s+run\s/,
  /^yarn\s+run\s/,
  /^npm\s+test\s/,
  /^npm\s+build\s/,
];

const BASH_DESTRUCTIVE_PATTERNS = [
  /^rm\s/,
  /^rmdir\s/,
  /^dd\s/,
  /^mkfs\s/,
  /^fdisk\s/,
  /^parted\s/,
  /^sudo\s+rm\s/,
  /^sudo\s+dd\s/,
  /^sudo\s+mkfs\s/,
  /^chmod\s+777\s/,
  /^chmod\s+000\s/,
  /^kill\s+-9\s/,
  /^killall\s/,
  /^pkill\s+-9\s/,
  /^shutdown\s/,
  /^reboot\s/,
  /^init\s+0\s/,
  /^git\s+push\s+--force\s/,
  /^git\s+push\s+-f\s/,
  /^git\s+reset\s+--hard\s/,
  /^npm\s+uninstall\s/,
  /^npm\s+rm\s/,
  /^bun\s+remove\s/,
];

/**
 * Classify a bash command into a category
 */
export function classifyBashCommand(command: string): BashClassification {
  const trimmed = command.trim();

  // Check read-only patterns
  for (const pattern of BASH_READ_ONLY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        category: 'read-only',
        confidence: 0.95,
        reason: 'Matches safe read-only pattern',
      };
    }
  }

  // Check safe modification patterns
  for (const pattern of BASH_SAFE_MODIFICATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        category: 'safe-modification',
        confidence: 0.85,
        reason: 'Matches safe modification pattern',
      };
    }
  }

  // Check destructive patterns
  for (const pattern of BASH_DESTRUCTIVE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        category: 'destructive',
        confidence: 0.95,
        reason: 'Matches destructive command pattern',
      };
    }
  }

  // Default to unknown
  return {
    category: 'unknown',
    confidence: 0.5,
    reason: 'Command pattern not classified',
  };
}

// ============================================================================
// Permission Evaluator
// ============================================================================

/**
 * Permission evaluation result
 */
export interface PermissionEvaluation {
  /** Auto-decision if matched a rule, undefined if needs user approval */
  autoDecision?: ApprovalDecision;
  /** Whether a rule was matched */
  matched: boolean;
  /** The rule that was matched */
  matchedRule?: PermissionRule;
  /** Risk level of the operation */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Human-readable reason */
  reason: string;
}

/**
 * Permission evaluator for tool calls
 */
export class PermissionEvaluator {
  private rules: PermissionRule[] = [];
  private customRules: PermissionRule[] = [];

  constructor() {
    // Load predefined rules
    this.rules = [...SAFE_PATTERNS, ...MEDIUM_RISK_PATTERNS, ...DANGEROUS_PATTERNS];
  }

  /**
   * Add a custom permission rule
   */
  addRule(rule: PermissionRule): void {
    this.customRules.push(rule);
  }

  /**
   * Remove a custom rule by ID
   */
  removeRule(ruleId: string): boolean {
    const index = this.customRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.customRules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all active rules (predefined + custom)
   */
  getAllRules(): PermissionRule[] {
    return [...this.rules, ...this.customRules.filter(r => r.enabled)];
  }

  /**
   * Evaluate a tool call against permission rules
   */
  evaluate(toolName: string, args?: Record<string, unknown>): PermissionEvaluation {
    const allRules = this.getAllRules();

    // Check rules in order: dangerous patterns first, then safe patterns
    const sortedRules = [
      ...allRules.filter(r => r.riskLevel === 'critical'),
      ...allRules.filter(r => r.riskLevel === 'high'),
      ...allRules.filter(r => r.riskLevel === 'medium'),
      ...allRules.filter(r => r.riskLevel === 'low'),
    ];

    for (const rule of sortedRules) {
      // Check tool name pattern
      const toolPattern = rule.toolPattern.replace(/\*/g, '.*');
      const toolRegex = new RegExp(`^${toolPattern}$`);

      if (!toolRegex.test(toolName)) {
        continue;
      }

      // Check args pattern if specified
      if (rule.argsPattern && args) {
        const argsString = JSON.stringify(args);
        if (!rule.argsPattern.test(argsString)) {
          continue;
        }
      }

      // Rule matched!
      return {
        autoDecision: rule.decision === 'deny' ? 'deny' : undefined,
        matched: true,
        matchedRule: rule,
        riskLevel: rule.riskLevel,
        reason: rule.description,
      };
    }

    // No rule matched - require user approval
    return {
      matched: false,
      riskLevel: 'medium',
      reason: 'No permission rule matched - user approval required',
    };
  }

  /**
   * Clear all custom rules
   */
  clearCustomRules(): void {
    this.customRules = [];
  }

  /**
   * Get custom rules (for export/save)
   */
  getCustomRules(): PermissionRule[] {
    return [...this.customRules];
  }
}

// ============================================================================
// Session Permission Manager
// ============================================================================

/**
 * Manages session-level approved tools
 */
export class SessionPermissionManager {
  private sessionApproved: Map<string, boolean> = new Map();
  private alwaysDeny: Set<string> = new Set();

  /**
   * Check if a tool is session-approved
   */
  isApproved(toolName: string): boolean {
    return this.sessionApproved.get(toolName) ?? false;
  }

  /**
   * Check if a tool is always denied
   */
  isDenied(toolName: string): boolean {
    return this.alwaysDeny.has(toolName);
  }

  /**
   * Approve a tool for the session
   */
  approve(toolName: string): void {
    this.sessionApproved.set(toolName, true);
  }

  /**
   * Deny a tool for the session
   */
  deny(toolName: string): void {
    this.sessionApproved.set(toolName, false);
    this.alwaysDeny.add(toolName);
  }

  /**
   * Clear session permissions
   */
  clear(): void {
    this.sessionApproved.clear();
    this.alwaysDeny.clear();
  }

  /**
   * Get all approved tools
   */
  getApprovedTools(): string[] {
    return Array.from(this.sessionApproved.entries())
      .filter(([_, approved]) => approved)
      .map(([tool, _]) => tool);
  }

  /**
   * Serialize state for storage
   */
  serialize(): { approved: string[]; denied: string[] } {
    return {
      approved: this.getApprovedTools(),
      denied: Array.from(this.alwaysDeny),
    };
  }

  /**
   * Restore state from storage
   */
  restore(state: { approved: string[]; denied: string[] }): void {
    this.clear();
    state.approved.forEach(tool => this.approve(tool));
    state.denied.forEach(tool => this.deny(tool));
  }
}

// ============================================================================
// Default exports
// ============================================================================

// Singleton instances
let permissionEvaluator: PermissionEvaluator | null = null;
let sessionManager: SessionPermissionManager | null = null;

/**
 * Get the singleton permission evaluator
 */
export function getPermissionEvaluator(): PermissionEvaluator {
  if (!permissionEvaluator) {
    permissionEvaluator = new PermissionEvaluator();
  }
  return permissionEvaluator;
}

/**
 * Get the singleton session permission manager
 */
export function getSessionPermissionManager(): SessionPermissionManager {
  if (!sessionManager) {
    sessionManager = new SessionPermissionManager();
  }
  return sessionManager;
}

/**
 * Reset all permission state (for testing or new session)
 */
export function resetPermissions(): void {
  permissionEvaluator = null;
  sessionManager = null;
}
