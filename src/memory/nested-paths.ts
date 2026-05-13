/**
 * Nested Memory Paths
 *
 * Provides hierarchical memory path management with:
 * - Nested path resolution (e.g., team/project/agent/memory)
 * - Memory path inheritance and overrides
 * - Path pattern matching and resolution
 *
 * Reference: Claude Code's nested memory path system
 */

import { join, relative, resolve, isAbsolute, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

/**
 * Memory path scope levels (hierarchical)
 */
export type MemoryScope = 'global' | 'user' | 'team' | 'project' | 'session' | 'agent';

/**
 * Nested memory path configuration
 */
export interface NestedMemoryPath {
  /** Unique path identifier */
  id: string;
  /** Path scope */
  scope: MemoryScope;
  /** Full resolved path */
  path: string;
  /** Parent path (if any) */
  parentPath?: string;
  /** Child paths */
  childPaths: string[];
  /** Priority (higher wins in conflict) */
  priority: number;
  /** Whether this path is active */
  active: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Memory path resolution options
 */
export interface PathResolutionOptions {
  /** Whether to create path if not exists */
  create?: boolean;
  /** Fallback to parent path if not found */
  fallbackToParent?: boolean;
  /** Scope filter */
  scopeFilter?: MemoryScope[];
  /** Priority threshold */
  minPriority?: number;
}

// ============================================================================
// NestedMemoryPaths Manager
// ============================================================================

/**
 * Manages hierarchical memory paths with nested resolution
 */
export class NestedMemoryPaths {
  private paths: Map<string, NestedMemoryPath> = new Map();
  private pathHierarchy: Map<string, string[]> = new Map(); // parent -> children

  /**
   * Register a memory path
   */
  registerPath(config: {
    id: string;
    scope: MemoryScope;
    path: string;
    parentPath?: string;
    priority?: number;
    metadata?: Record<string, unknown>;
  }): NestedMemoryPath {
    const { id, scope, path, parentPath, priority = 0, metadata } = config;

    // Unregister existing if present
    if (this.paths.has(id)) {
      this.unregisterPath(id);
    }

    const nestedPath: NestedMemoryPath = {
      id,
      scope,
      path: isAbsolute(path) ? path : resolve(process.cwd(), path),
      parentPath,
      childPaths: [],
      priority,
      active: true,
      metadata,
    };

    this.paths.set(id, nestedPath);

    // Update hierarchy
    if (parentPath) {
      const parent = this.paths.get(parentPath);
      if (parent) {
        parent.childPaths.push(id);
      }
      this.pathHierarchy.set(parentPath, [
        ...(this.pathHierarchy.get(parentPath) || []),
        id,
      ]);
    }

    return nestedPath;
  }

  /**
   * Unregister a memory path
   */
  unregisterPath(id: string): boolean {
    const path = this.paths.get(id);
    if (!path) return false;

    // Remove from parent's children
    if (path.parentPath) {
      const siblings = this.pathHierarchy.get(path.parentPath) || [];
      this.pathHierarchy.set(
        path.parentPath,
        siblings.filter(childId => childId !== id)
      );
    }

    // Recursively unregister children
    const children = this.pathHierarchy.get(id) || [];
    for (const childId of children) {
      this.unregisterPath(childId);
    }

    this.pathHierarchy.delete(id);
    return this.paths.delete(id);
  }

  /**
   * Get a memory path by ID
   */
  getPath(id: string): NestedMemoryPath | undefined {
    return this.paths.get(id);
  }

  /**
   * Get all paths in a scope
   */
  getPathsByScope(scope: MemoryScope): NestedMemoryPath[] {
    return Array.from(this.paths.values()).filter(p => p.scope === scope);
  }

  /**
   * Resolve a memory path, considering hierarchy
   */
  resolvePath(
    idOrPattern: string,
    options: PathResolutionOptions = {}
  ): string | null {
    const { create = false, fallbackToParent = true } = options;

    // Direct ID lookup
    const direct = this.paths.get(idOrPattern);
    if (direct) {
      if (create && !existsSync(direct.path)) {
        mkdirSync(direct.path, { recursive: true });
      }
      return direct.path;
    }

    // Pattern matching
    if (idOrPattern.includes('*')) {
      const matches = this.findMatchingPaths(idOrPattern);
      if (matches.length > 0) {
        // Return highest priority match
        const sorted = matches.sort((a, b) => b.priority - a.priority);
        return sorted[0].path;
      }
    }

    // Fallback to parent
    if (fallbackToParent) {
      return this.findParentPath(idOrPattern);
    }

    return null;
  }

  /**
   * Find matching paths by pattern
   */
  findMatchingPaths(pattern: string): NestedMemoryPath[] {
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );

    return Array.from(this.paths.values()).filter(p => regex.test(p.id));
  }

  /**
   * Find parent path for a given ID
   */
  findParentPath(id: string): string | null {
    const parts = id.split('/');
    parts.pop();

    while (parts.length > 0) {
      const parentId = parts.join('/');
      const parent = this.paths.get(parentId);
      if (parent) {
        return parent.path;
      }
      parts.pop();
    }

    return null;
  }

  /**
   * Get all child paths for a given ID
   */
  getChildPaths(id: string): NestedMemoryPath[] {
    const childIds = this.pathHierarchy.get(id) || [];
    return childIds
      .map(childId => this.paths.get(childId))
      .filter((p): p is NestedMemoryPath => p !== undefined);
  }

  /**
   * Get full path hierarchy from root to leaf
   */
  getPathHierarchy(id: string): NestedMemoryPath[] {
    const hierarchy: NestedMemoryPath[] = [];
    let current = this.paths.get(id);

    while (current) {
      hierarchy.unshift(current);
      current = current.parentPath
        ? this.paths.get(current.parentPath)
        : undefined;
    }

    return hierarchy;
  }

  /**
   * Enable/disable a path
   */
  setPathActive(id: string, active: boolean): boolean {
    const path = this.paths.get(id);
    if (!path) return false;
    path.active = active;
    return true;
  }

  /**
   * Update path priority
   */
  setPathPriority(id: string, priority: number): boolean {
    const path = this.paths.get(id);
    if (!path) return false;
    path.priority = priority;
    return true;
  }

  /**
   * List all registered paths
   */
  listPaths(options: { activeOnly?: boolean; scope?: MemoryScope } = {}): NestedMemoryPath[] {
    let paths = Array.from(this.paths.values());

    if (options.activeOnly) {
      paths = paths.filter(p => p.active);
    }

    if (options.scope) {
      paths = paths.filter(p => p.scope === options.scope);
    }

    return paths.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get relative path between two memory paths
   */
  getRelativePath(fromId: string, toId: string): string | null {
    const from = this.paths.get(fromId);
    const to = this.paths.get(toId);

    if (!from || !to) return null;

    return relative(from.path, to.path);
  }

  /**
   * Check if a path contains another
   */
  containsPath(outerId: string, innerId: string): boolean {
    const outer = this.paths.get(outerId);
    const inner = this.paths.get(innerId);

    if (!outer || !inner) return false;

    const relativePath = relative(outer.path, inner.path);
    return !relativePath.startsWith('..') && !isAbsolute(relativePath);
  }

  /**
   * Create a nested path under a parent
   */
  createNestedPath(parentId: string, childId: string, scope: MemoryScope): NestedMemoryPath | null {
    const parent = this.paths.get(parentId);
    if (!parent) return null;

    const childPath = join(parent.path, childId);
    return this.registerPath({
      id: `${parentId}/${childId}`,
      scope,
      path: childPath,
      parentPath: parentId,
      priority: parent.priority - 1,
    });
  }

  /**
   * Export all paths configuration
   */
  exportConfig(): object {
    return {
      paths: Array.from(this.paths.values()),
      hierarchy: Array.from(this.pathHierarchy.entries()),
    };
  }

  /**
   * Import paths configuration
   */
  importConfig(config: ReturnType<NestedMemoryPaths['exportConfig']>): void {
    const { paths } = config as {
      paths: NestedMemoryPath[];
      hierarchy: [string, string[]][];
    };

    for (const path of paths) {
      this.paths.set(path.id, path);
    }
  }

  /**
   * Clear all paths
   */
  clear(): void {
    this.paths.clear();
    this.pathHierarchy.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let nestedMemoryPaths: NestedMemoryPaths | null = null;

export function getNestedMemoryPaths(): NestedMemoryPaths {
  if (!nestedMemoryPaths) {
    nestedMemoryPaths = new NestedMemoryPaths();
  }
  return nestedMemoryPaths;
}

export function resetNestedMemoryPaths(): void {
  nestedMemoryPaths = null;
}

// ============================================================================
// Default Path Registration
// ============================================================================

/**
 * Register default memory paths based on common patterns
 */
export function registerDefaultMemoryPaths(config: {
  userDir?: string;
  projectDir?: string;
  sessionDir?: string;
}): void {
  const { userDir = join(process.env.HOME || '~', '.upup'), projectDir = process.cwd(), sessionDir } = config;
  const paths = getNestedMemoryPaths();

  // Global user-level paths
  paths.registerPath({
    id: 'global',
    scope: 'global',
    path: join(userDir, 'memory'),
    priority: 0,
  });

  // User-level paths
  paths.registerPath({
    id: 'user',
    scope: 'user',
    path: join(userDir, 'user'),
    parentPath: 'global',
    priority: 10,
  });

  // Project-level paths
  paths.registerPath({
    id: 'project',
    scope: 'project',
    path: join(projectDir, '.upup'),
    parentPath: 'user',
    priority: 20,
  });

  // Session-level paths (if provided)
  if (sessionDir) {
    paths.registerPath({
      id: 'session',
      scope: 'session',
      path: sessionDir,
      parentPath: 'project',
      priority: 30,
    });
  }
}