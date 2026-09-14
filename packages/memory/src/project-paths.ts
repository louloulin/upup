/**
 * Project Memory Paths - Project-level memory isolation
 *
 * Features:
 * - Project-specific memory directories
 * - Memory path resolution per project
 * - Project listing and management
 *
 * Reference: Claude Code's projects/<slug>/memory/ structure
 */

import { join } from 'node:path';
import { existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { getUpupDir } from '@upup/utils';

// ============================================================================
// Types
// ============================================================================

export interface ProjectMemoryPath {
  /** URL-safe encoded project slug */
  projectSlug: string;
  /** Original project path (decoded) */
  projectPath: string;
  /** Root directory for project */
  rootDir: string;
  /** Memory directory for this project */
  memoryDir: string;
  /** Sessions directory for this project */
  sessionsDir: string;
  /** MEMORY.md index path */
  indexPath: string;
  /** Memory type subdirectories */
  typeDirs: {
    user: string;
    feedback: string;
    project: string;
    reference: string;
  };
}

export interface ProjectInfo {
  slug: string;
  path: string;
  lastSessionAt?: number;
  memoryCount?: number;
}

// ============================================================================
// Project Slug Utilities
// ============================================================================

/**
 * Encode a project path to URL-safe slug
 */
export function encodeProjectSlug(projectPath: string): string {
  // Replace path separators and special chars with underscore
  return encodeURIComponent(projectPath.replace(/[/\\:]/g, '_'));
}

/**
 * Decode a URL-safe slug back to project path
 */
export function decodeProjectSlug(slug: string): string {
  return decodeURIComponent(slug.replace(/_/g, '/'));
}

// ============================================================================
// ProjectMemoryPaths Manager
// ============================================================================

export class ProjectMemoryPaths {
  private paths: Map<string, ProjectMemoryPath> = new Map();

  /**
   * Get or create project memory paths
   */
  getOrCreateProjectPath(projectPath: string): ProjectMemoryPath {
    const slug = encodeProjectSlug(projectPath);

    if (this.paths.has(slug)) {
      return this.paths.get(slug)!;
    }

    const projectsDir = join(getUpupDir(), 'projects');
    const rootDir = join(projectsDir, slug);

    const path: ProjectMemoryPath = {
      projectSlug: slug,
      projectPath,
      rootDir,
      memoryDir: join(rootDir, 'memory'),
      sessionsDir: join(rootDir, 'sessions'),
      indexPath: join(rootDir, 'memory', 'MEMORY.md'),
      typeDirs: {
        user: join(rootDir, 'memory', 'user'),
        feedback: join(rootDir, 'memory', 'feedback'),
        project: join(rootDir, 'memory', 'project'),
        reference: join(rootDir, 'memory', 'reference'),
      },
    };

    this.paths.set(slug, path);
    return path;
  }

  /**
   * Get project path by slug
   */
  getProjectPath(slug: string): ProjectMemoryPath | undefined {
    return this.paths.get(slug);
  }

  /**
   * List all registered projects
   */
  listProjects(): string[] {
    return Array.from(this.paths.keys());
  }

  /**
   * Scan all projects from disk
   */
  scanProjects(): ProjectInfo[] {
    const projectsDir = join(getUpupDir(), 'projects');

    if (!existsSync(projectsDir)) {
      return [];
    }

    const projects: ProjectInfo[] = [];

    try {
      const entries = readdirSync(projectsDir);

      for (const entry of entries) {
        const entryPath = join(projectsDir, entry);
        const stat = statSync(entryPath);

        if (stat.isDirectory()) {
          const projectPath = decodeProjectSlug(entry);
          projects.push({
            slug: entry,
            path: projectPath,
          });
        }
      }
    } catch {
      // Ignore errors
    }

    return projects;
  }

  /**
   * Ensure project directories exist
   */
  ensureDirectories(projectPath: string): ProjectMemoryPath {
    const path = this.getOrCreateProjectPath(projectPath);

    // Create all necessary directories
    mkdirSync(path.rootDir, { recursive: true });
    mkdirSync(path.memoryDir, { recursive: true });
    mkdirSync(path.sessionsDir, { recursive: true });
    mkdirSync(path.typeDirs.user, { recursive: true });
    mkdirSync(path.typeDirs.feedback, { recursive: true });
    mkdirSync(path.typeDirs.project, { recursive: true });
    mkdirSync(path.typeDirs.reference, { recursive: true });

    return path;
  }

  /**
   * Get memory directory for specific type
   */
  getMemoryTypeDir(projectPath: string, type: string): string {
    const path = this.getOrCreateProjectPath(projectPath);
    return path.typeDirs[type as keyof typeof path.typeDirs] ?? path.memoryDir;
  }

  /**
   * Clear cached paths
   */
  clear(): void {
    this.paths.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let projectMemoryPaths: ProjectMemoryPaths | null = null;

export function getProjectMemoryPaths(): ProjectMemoryPaths {
  if (!projectMemoryPaths) {
    projectMemoryPaths = new ProjectMemoryPaths();
  }
  return projectMemoryPaths;
}

export function resetProjectMemoryPaths(): void {
  projectMemoryPaths = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get global memory directory
 */
export function getGlobalMemoryDir(): string {
  return join(getUpupDir(), 'memory');
}

/**
 * Get projects memory base directory
 */
export function getProjectsMemoryDir(): string {
  return join(getUpupDir(), 'projects');
}

/**
 * Check if a path is a project memory path
 */
export function isProjectMemoryPath(filePath: string): boolean {
  const projectsDir = getProjectsMemoryDir();
  return filePath.startsWith(projectsDir + '/');
}

/**
 * Extract project slug from memory file path
 */
export function extractProjectSlug(filePath: string): string | null {
  const projectsDir = getProjectsMemoryDir();
  if (!filePath.startsWith(projectsDir + '/')) {
    return null;
  }

  const relative = filePath.slice(projectsDir.length + 1);
  const parts = relative.split('/');
  return parts[0] || null;
}

// ============================================================================
// Module Exports
// ============================================================================

export const projectMem = {
  ProjectMemoryPaths,
  getProjectMemoryPaths,
  resetProjectMemoryPaths,
  encodeProjectSlug,
  decodeProjectSlug,
  getGlobalMemoryDir,
  getProjectsMemoryDir,
  isProjectMemoryPath,
  extractProjectSlug,
};