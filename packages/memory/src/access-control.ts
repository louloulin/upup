/**
 * Memory Access Control - Scope-based memory isolation and permissions
 *
 * Features:
 * - Scope-based access control (global, project, team, private)
 * - Permission checks for memory read/write operations
 * - Team membership validation
 * - Project isolation enforcement
 *
 * Reference: Claude Code's memory access control
 */

import type { MemoryScope, MemoryFileMeta } from './types';
import { MEMORY_SCOPE_PRIORITY, getDefaultScopeForType } from './types';
import { getProjectMemoryPaths } from './project-paths';
import { getTeamMemoryPaths } from './team-paths';

// ============================================================================
// Types
// ============================================================================

export interface AccessContext {
  /** Current user ID */
  userId: string;
  /** Current session ID */
  sessionId: string;
  /** Current project path */
  projectPath?: string;
  /** Current team ID */
  teamId?: string;
  /** Current scope level */
  currentScope: MemoryScope;
}

export interface AccessPermission {
  /** Whether read is allowed */
  canRead: boolean;
  /** Whether write is allowed */
  canWrite: boolean;
  /** Whether delete is allowed */
  canDelete: boolean;
  /** Reason for denial if any */
  deniedReason?: string;
}

export interface MemoryAccessRule {
  /** Memory scope */
  scope: MemoryScope;
  /** Allowed operations */
  operations: {
    read: boolean;
    write: boolean;
    delete: boolean;
  };
  /** Required team membership */
  requiredTeamId?: string;
  /** Required project path */
  requiredProjectPath?: string;
}

// ============================================================================
// Default Access Rules
// ============================================================================

const DEFAULT_ACCESS_RULES: MemoryAccessRule[] = [
  {
    scope: 'private',
    operations: { read: true, write: true, delete: true },
  },
  {
    scope: 'team',
    operations: { read: true, write: true, delete: false },
    requiredTeamId: 'any', // Must be a team member
  },
  {
    scope: 'project',
    operations: { read: true, write: true, delete: false },
    requiredProjectPath: 'any', // Must be in the project
  },
  {
    scope: 'global',
    operations: { read: true, write: false, delete: false },
  },
];

// ============================================================================
// Memory Access Control
// ============================================================================

export class MemoryAccessControl {
  private rules: MemoryAccessRule[] = DEFAULT_ACCESS_RULES;

  /**
   * Add custom access rule
   */
  addRule(rule: MemoryAccessRule): void {
    // Remove existing rule for same scope
    this.rules = this.rules.filter(r => r.scope !== rule.scope);
    this.rules.push(rule);
  }

  /**
   * Check if user can read a memory file
   */
  canRead(context: AccessContext, memory?: MemoryFileMeta): AccessPermission {
    const scope = memory?.scope ?? context.currentScope;

    // Check scope-specific rules
    const rule = this.rules.find(r => r.scope === scope);
    if (!rule) {
      return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Unknown scope' };
    }

    // Team scope requires membership
    if (scope === 'team') {
      if (!context.teamId) {
        return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Not a team member' };
      }
      if (memory?.teamId && memory.teamId !== context.teamId) {
        return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Different team' };
      }
    }

    // Project scope requires project membership
    if (scope === 'project') {
      if (!context.projectPath) {
        return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Not in a project' };
      }
      if (memory?.projectId) {
        const projectMemPaths = getProjectMemoryPaths();
        const memProject = projectMemPaths.getProjectPath(memory.projectId);
        if (memProject && memProject.projectPath !== context.projectPath) {
          return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Different project' };
        }
      }
    }

    return {
      canRead: rule.operations.read,
      canWrite: rule.operations.write,
      canDelete: rule.operations.delete,
    };
  }

  /**
   * Check if user can write to a memory scope
   */
  canWrite(context: AccessContext, targetScope?: MemoryScope): AccessPermission {
    const scope = targetScope ?? context.currentScope;

    const rule = this.rules.find(r => r.scope === scope);
    if (!rule) {
      return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Unknown scope' };
    }

    // Team writes require membership
    if (scope === 'team') {
      if (!context.teamId) {
        return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Not a team member' };
      }
    }

    // Project writes require being in project
    if (scope === 'project') {
      if (!context.projectPath) {
        return { canRead: false, canWrite: false, canDelete: false, deniedReason: 'Not in a project' };
      }
    }

    return {
      canRead: rule.operations.read,
      canWrite: rule.operations.write,
      canDelete: rule.operations.delete,
    };
  }

  /**
   * Determine the appropriate scope for a new memory
   */
  determineScope(
    type: string,
    options?: {
      explicitScope?: MemoryScope;
      teamId?: string;
      projectId?: string;
    }
  ): MemoryScope {
    // Explicit scope takes priority
    if (options?.explicitScope) {
      return options.explicitScope;
    }

    // Team memories have team scope
    if (options?.teamId) {
      return 'team';
    }

    // Project-specific memories
    if (options?.projectId) {
      return 'project';
    }

    // Default based on memory type
    return getDefaultScopeForType(type as 'user' | 'feedback' | 'project' | 'reference');
  }

  /**
   * Check if two scopes can see each other's memories
   */
  canSeeScope(viewerScope: MemoryScope, targetScope: MemoryScope): boolean {
    // Higher priority scopes can see lower priority scopes
    const viewerPriority = MEMORY_SCOPE_PRIORITY[viewerScope];
    const targetPriority = MEMORY_SCOPE_PRIORITY[targetScope];

    // Same scope is always visible
    if (viewerScope === targetScope) {
      return true;
    }

    // Team members can see project and global
    if (viewerScope === 'team' && targetPriority <= MEMORY_SCOPE_PRIORITY.project) {
      return true;
    }

    // Project members can see global
    if (viewerScope === 'project' && targetPriority <= MEMORY_SCOPE_PRIORITY.global) {
      return true;
    }

    // Lower priority scopes cannot see higher priority
    return viewerPriority >= targetPriority;
  }

  /**
   * Filter memories based on access context
   */
  filterAccessible(memories: MemoryFileMeta[], context: AccessContext): MemoryFileMeta[] {
    return memories.filter(memory => {
      const permission = this.canRead(context, memory);
      return permission.canRead;
    });
  }

  /**
   * Get visible scopes for current context
   */
  getVisibleScopes(context: AccessContext): MemoryScope[] {
    const scopes: MemoryScope[] = ['global']; // Everyone can see global

    // Project members see project
    if (context.projectPath) {
      scopes.push('project');
    }

    // Team members see team
    if (context.teamId) {
      scopes.push('team');
    }

    // Everyone sees private (their own)
    scopes.push('private');

    return [...new Set(scopes)];
  }
}

// ============================================================================
// Singleton
// ============================================================================

let accessControl: MemoryAccessControl | null = null;

export function getMemoryAccessControl(): MemoryAccessControl {
  if (!accessControl) {
    accessControl = new MemoryAccessControl();
  }
  return accessControl;
}

export function resetMemoryAccessControl(): void {
  accessControl = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick permission check
 */
export function canReadMemory(
  memory: MemoryFileMeta,
  context: AccessContext
): boolean {
  return getMemoryAccessControl().canRead(context, memory).canRead;
}

/**
 * Quick scope determination
 */
export function determineMemoryScope(
  type: string,
  options?: {
    explicitScope?: MemoryScope;
    teamId?: string;
    projectId?: string;
  }
): MemoryScope {
  return getMemoryAccessControl().determineScope(type, options);
}

// ============================================================================
// Module Exports
// ============================================================================

export const memoryAccess = {
  MemoryAccessControl,
  getMemoryAccessControl,
  resetMemoryAccessControl,
  canReadMemory,
  determineMemoryScope,
};