/**
 * Permission Hooks - Integration with Tool Executor
 *
 * Features:
 * - Permission request hook integration
 * - Permission denied hook handling
 * - Default dangerous tool blocks
 * - Permission caching
 *
 * Reference: Loucode's permission hooks integration
 */

import { info, warn, error } from '../utils/logging/logger.js';
import { getHookExecutor, type PermissionRequestParams } from './tool-hooks.js';

// ============================================================================
// Dangerous Tool Patterns
// ============================================================================

/**
 * Tools that require explicit permission
 */
const DANGEROUS_TOOLS = new Set([
  'write_file',
  'edit_file',
  'delete_file',
  'bash',
  'execute',
  'run_command',
  'remove_directory',
  'delete_directory',
]);

/**
 * Tools that are always blocked
 */
const BLOCKED_TOOLS = new Set([
  'format_disk',
  'rm_rf',
  'sudo',
  'chmod_777',
]);

/**
 * Tools that require extra scrutiny
 */
const SCRUTINY_TOOLS = new Set([
  'bash',
  'execute',
  'run_command',
  'git_push',
  'git_force_push',
]);

// ============================================================================
// Permission Result
// ============================================================================

/**
 * Permission decision
 */
export type PermissionResult =
  | { decision: 'allow'; reason?: string }
  | { decision: 'block'; reason: string }
  | { decision: 'deny'; reason: string }
  | { decision: 'ask'; reason?: string };

/**
 * Permission context
 */
export interface PermissionContext {
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
  toolCallId?: string;
}

// ============================================================================
// Permission Checker
// ============================================================================

export class PermissionChecker {
  private cache: Map<string, { decision: 'allow' | 'block' | 'deny'; expires: number }> = new Map();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if tool requires permission
   */
  requiresPermission(toolName: string): boolean {
    return DANGEROUS_TOOLS.has(toolName);
  }

  /**
   * Check if tool is always blocked
   */
  isBlocked(toolName: string): boolean {
    return BLOCKED_TOOLS.has(toolName);
  }

  /**
   * Check if tool requires extra scrutiny
   */
  requiresScutiny(toolName: string): boolean {
    return SCRUTINY_TOOLS.has(toolName);
  }

  /**
   * Get cached permission decision
   */
  private getCached(context: PermissionContext): PermissionResult | null {
    const key = `${context.toolName}:${JSON.stringify(context.args).slice(0, 100)}`;
    const cached = this.cache.get(key);

    if (!cached) return null;

    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }

    return cached.decision === 'allow'
      ? { decision: 'allow', reason: 'Cached permission' }
      : { decision: 'block', reason: 'Cached denial' };
  }

  /**
   * Cache permission decision
   */
  private setCached(context: PermissionContext, result: PermissionResult): void {
    if (result.decision === 'ask') return;

    const key = `${context.toolName}:${JSON.stringify(context.args).slice(0, 100)}`;
    this.cache.set(key, {
      decision: result.decision,
      expires: Date.now() + this.cacheTTL,
    });
  }

  /**
   * Check permission with hooks
   */
  async checkPermission(context: PermissionContext): Promise<PermissionResult> {
    const { toolName, args, sessionId, toolCallId } = context;

    // Check if blocked
    if (this.isBlocked(toolName)) {
      return { decision: 'block', reason: `Tool ${toolName} is permanently blocked` };
    }

    // Check cache
    const cached = this.getCached(context);
    if (cached) return cached;

    // Build permission params
    const params: PermissionRequestParams = {
      toolName,
      args,
      reason: this.getDefaultReason(toolName, args),
    };

    // Get hook executor
    const hookExecutor = getHookExecutor();

    try {
      // Execute permission request hooks
      const output = await hookExecutor.permissionRequest(params);

      // Check hook decision
      const hookDecision = output.decision;
      let result: PermissionResult;

      if (hookDecision === 'allow' || hookDecision === 'approve') {
        result = { decision: 'allow', reason: output.reason || 'Approved by hook' };
      } else if (hookDecision === 'deny' || hookDecision === 'block') {
        result = { decision: 'block', reason: output.reason || 'Denied by hook' };

        // Execute permission denied hooks
        await hookExecutor.executeHooks('PermissionDenied', {
          toolName,
          args,
          toolCallId,
          reason: result.reason,
        });
      } else if (hookDecision === 'ask') {
        result = { decision: 'ask', reason: 'User prompt required' };
      } else {
        // Default: allow safe tools, scrutinize dangerous ones
        if (this.requiresScutiny(toolName)) {
          result = { decision: 'ask', reason: `Tool ${toolName} requires user confirmation` };
        } else {
          result = { decision: 'allow', reason: 'Default allow for safe tools' };
        }
      }

      // Cache result
      this.setCached(context, result);

      return result;
    } catch (err) {
      error('system', `Permission check failed: ${err}`);

      // Fail safe: block on error for dangerous tools
      if (this.requiresPermission(toolName)) {
        return { decision: 'block', reason: 'Permission check failed' };
      }

      return { decision: 'allow', reason: 'Allowed on permission error' };
    }
  }

  /**
   * Get default reason for tool
   */
  private getDefaultReason(toolName: string, args: Record<string, unknown>): string | undefined {
    switch (toolName) {
      case 'write_file':
        return `Writing to file: ${args.path || 'unknown path'}`;
      case 'edit_file':
        return `Editing file: ${args.path || 'unknown path'}`;
      case 'bash':
        return `Running command: ${args.command || 'unknown command'}`;
      case 'delete_file':
        return `Deleting file: ${args.path || 'unknown path'}`;
      default:
        return `Tool ${toolName} requires permission`;
    }
  }

  /**
   * Clear permission cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear expired cache entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expires) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================================================
// Default Permission Hooks
// ============================================================================

/**
 * Create a dangerous tool warning hook
 */
export function createDangerousToolWarningHook(): {
  id: string;
  name: string;
  event: 'PermissionRequest';
  type: 'function';
  handler: (params: unknown, context?: unknown) => Promise<{
    decision?: 'ask' | 'allow' | 'block' | 'deny';
    reason?: string;
  }>;
} {
  return {
    id: 'permission-dangerous-tool-warning',
    name: 'Dangerous Tool Warning',
    event: 'PermissionRequest',
    type: 'function',
    handler: async (params: unknown) => {
      const p = params as PermissionRequestParams;

      // Block known dangerous tools
      if (BLOCKED_TOOLS.has(p.toolName)) {
        warn('system', `Blocked dangerous tool: ${p.toolName}`);
        return {
          decision: 'block',
          reason: `Tool ${p.toolName} is permanently blocked for security`,
        };
      }

      // Warn about scrutiny tools
      if (SCRUTINY_TOOLS.has(p.toolName)) {
        info('system', `Scrutiny tool requested: ${p.toolName}`);
        return {
          decision: 'ask',
          reason: `Tool ${p.toolName} requires explicit confirmation`,
        };
      }

      // Allow other dangerous tools (will still be asked)
      if (DANGEROUS_TOOLS.has(p.toolName)) {
        return {
          decision: 'ask',
          reason: `Tool ${p.toolName} modifies system state`,
        };
      }

      // Default: allow
      return { decision: 'allow' };
    },
  };
}

/**
 * Create a git protection hook
 */
export function createGitProtectionHook(): {
  id: string;
  name: string;
  event: 'PermissionRequest';
  type: 'function';
  handler: (params: unknown, context?: unknown) => Promise<{
    decision?: 'ask' | 'allow' | 'block' | 'deny';
    reason?: string;
  }>;
} {
  return {
    id: 'permission-git-protection',
    name: 'Git Protection',
    event: 'PermissionRequest',
    type: 'function',
    handler: async (params: unknown) => {
      const p = params as PermissionRequestParams;

      // Block force push
      if (p.toolName === 'bash' && p.args.command?.toString().includes('git push --force')) {
        warn('system', 'Blocked git force push');
        return {
          decision: 'block',
          reason: 'Git force push is blocked by policy',
        };
      }

      // Block force push alias
      if (p.toolName === 'bash' && p.args.command?.toString().includes('git push -f')) {
        warn('system', 'Blocked git force push (-f flag)');
        return {
          decision: 'block',
          reason: 'Git force push is blocked by policy',
        };
      }

      return {};
    },
  };
}

// ============================================================================
// Permission Hook Executor
// ============================================================================

/**
 * Execute permission hooks for a tool call
 */
export async function executePermissionCheck(
  toolName: string,
  args: Record<string, unknown>,
  sessionId: string,
  toolCallId?: string,
): Promise<PermissionResult> {
  const checker = new PermissionChecker();

  return checker.checkPermission({
    toolName,
    args,
    sessionId,
    toolCallId,
  });
}

// ============================================================================
// Singleton
// ============================================================================

let permissionChecker: PermissionChecker | null = null;

export function getPermissionChecker(): PermissionChecker {
  if (!permissionChecker) {
    permissionChecker = new PermissionChecker();
  }
  return permissionChecker;
}

export function resetPermissionChecker(): void {
  permissionChecker = null;
}
