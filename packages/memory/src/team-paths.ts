/**
 * Team Memory Paths - Multi-agent context sharing
 *
 * Features:
 * - Shared memory paths for team collaboration
 * - Per-team and cross-team memory contexts
 * - Memory path resolution for team members
 * - Team-aware memory loading
 *
 * Reference: Claude Code's teamMemPaths.ts for multi-agent context sharing
 */

import { join } from 'node:path';
import { TEAMS_DIR } from '../utils/storage-paths.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Team memory path configuration
 */
export interface TeamMemoryPath {
  /** Team identifier */
  teamId: string;
  /** Root directory for team memory */
  rootDir: string;
  /** Shared memory file path */
  sharedMemoryPath: string;
  /** Team-specific context file */
  contextPath: string;
  /** Individual agent memory directory */
  agentsDir: string;
  /** Prompts directory */
  promptsDir: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Team memory configuration
 */
export interface TeamMemoryConfig {
  /** Base directory for team memories */
  baseDir?: string;
  /** Default team name */
  defaultTeamId?: string;
  /** Enable cross-team memory sharing */
  crossTeamSharing?: boolean;
}

/**
 * Team member context
 */
export interface TeamMemberContext {
  /** Member ID */
  memberId: string;
  /** Team ID */
  teamId: string;
  /** Member's memory path */
  memoryPath: string;
  /** Member's role in team */
  role?: string;
  /** Last sync timestamp */
  lastSync?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TEAM_MEMORY_DIR = 'teams';
const DEFAULT_SHARED_MEMORY_FILE = 'shared.MEMORY.md';
const DEFAULT_CONTEXT_FILE = 'context.json';
const DEFAULT_AGENTS_DIR = 'agents';
const DEFAULT_PROMPTS_DIR = 'prompts';

// ============================================================================
// Team Memory Paths Manager
// ============================================================================

/**
 * Manages team memory paths for multi-agent context sharing
 */
export class TeamMemoryPaths {
  private config: Required<TeamMemoryConfig>;
  private teams: Map<string, TeamMemoryPath> = new Map();
  private members: Map<string, TeamMemberContext[]> = new Map();

  constructor(config: TeamMemoryConfig = {}) {
    this.config = {
      baseDir: config.baseDir ?? TEAMS_DIR,
      defaultTeamId: config.defaultTeamId ?? 'default',
      crossTeamSharing: config.crossTeamSharing ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // Team Management
  // ---------------------------------------------------------------------------

  /**
   * Register a team and create its memory paths
   */
  registerTeam(teamId: string, customRootDir?: string): TeamMemoryPath {
    const rootDir = customRootDir ?? join(this.config.baseDir, teamId);

    const path: TeamMemoryPath = {
      teamId,
      rootDir,
      sharedMemoryPath: join(rootDir, DEFAULT_SHARED_MEMORY_FILE),
      contextPath: join(rootDir, DEFAULT_CONTEXT_FILE),
      agentsDir: join(rootDir, DEFAULT_AGENTS_DIR),
      promptsDir: join(rootDir, DEFAULT_PROMPTS_DIR),
      createdAt: Date.now(),
    };

    this.teams.set(teamId, path);
    return path;
  }

  /**
   * Get team memory paths
   */
  getTeamPaths(teamId: string): TeamMemoryPath | undefined {
    return this.teams.get(teamId);
  }

  /**
   * Get or create team memory paths
   */
  getOrCreateTeamPaths(teamId: string): TeamMemoryPath {
    return this.teams.get(teamId) ?? this.registerTeam(teamId);
  }

  /**
   * List all registered teams
   */
  listTeams(): string[] {
    return Array.from(this.teams.keys());
  }

  /**
   * Unregister a team
   */
  unregisterTeam(teamId: string): boolean {
    this.members.delete(teamId);
    return this.teams.delete(teamId);
  }

  // ---------------------------------------------------------------------------
  // Member Management
  // ---------------------------------------------------------------------------

  /**
   * Register a team member
   */
  registerMember(
    memberId: string,
    teamId: string,
    role?: string,
  ): TeamMemberContext {
    const teamPaths = this.getOrCreateTeamPaths(teamId);
    const memoryPath = join(teamPaths.agentsDir, memberId, 'memory');

    const context: TeamMemberContext = {
      memberId,
      teamId,
      memoryPath,
      role,
      lastSync: Date.now(),
    };

    // Add to members list
    const teamMembers = this.members.get(teamId) ?? [];
    const existingIndex = teamMembers.findIndex(m => m.memberId === memberId);
    if (existingIndex >= 0) {
      teamMembers[existingIndex] = context;
    } else {
      teamMembers.push(context);
    }
    this.members.set(teamId, teamMembers);

    return context;
  }

  /**
   * Get members of a team
   */
  getTeamMembers(teamId: string): TeamMemberContext[] {
    return this.members.get(teamId) ?? [];
  }

  /**
   * Get member context
   */
  getMember(memberId: string, teamId: string): TeamMemberContext | undefined {
    const members = this.members.get(teamId);
    return members?.find(m => m.memberId === memberId);
  }

  /**
   * Update member sync timestamp
   */
  touchMember(memberId: string, teamId: string): void {
    const member = this.getMember(memberId, teamId);
    if (member) {
      member.lastSync = Date.now();
    }
  }

  // ---------------------------------------------------------------------------
  // Memory Path Resolution
  // ---------------------------------------------------------------------------

  /**
   * Get the shared memory path for a team
   */
  getSharedMemoryPath(teamId: string): string | undefined {
    return this.teams.get(teamId)?.sharedMemoryPath;
  }

  /**
   * Get member's personal memory path
   */
  getMemberMemoryPath(memberId: string, teamId: string): string | undefined {
    return this.getMember(memberId, teamId)?.memoryPath;
  }

  /**
   * Get team context file path
   */
  getContextPath(teamId: string): string | undefined {
    return this.teams.get(teamId)?.contextPath;
  }

  /**
   * Get team prompts directory
   */
  getPromptsDir(teamId: string): string | undefined {
    return this.teams.get(teamId)?.promptsDir;
  }

  // ---------------------------------------------------------------------------
  // Cross-Team Memory Sharing
  // ---------------------------------------------------------------------------

  /**
   * Get memory paths accessible to a member (including cross-team if enabled)
   */
  getAccessibleMemoryPaths(memberId: string, teamId: string): string[] {
    const paths: string[] = [];

    // Member's own memory
    const memberPath = this.getMemberMemoryPath(memberId, teamId);
    if (memberPath) paths.push(memberPath);

    // Team shared memory
    const sharedPath = this.getSharedMemoryPath(teamId);
    if (sharedPath) paths.push(sharedPath);

    // Cross-team shared memories (if enabled)
    if (this.config.crossTeamSharing) {
      for (const [otherTeamId, teamPaths] of this.teams) {
        if (otherTeamId !== teamId) {
          // Only add if there's a reason to share
          const otherMembers = this.getTeamMembers(otherTeamId);
          const hasConnection = otherMembers.some(m =>
            this.getTeamMembers(teamId).some(tm => tm.memberId === m.memberId)
          );
          if (hasConnection) {
            paths.push(teamPaths.sharedMemoryPath);
          }
        }
      }
    }

    return paths;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Enable/disable cross-team sharing
   */
  setCrossTeamSharing(enabled: boolean): void {
    this.config.crossTeamSharing = enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<TeamMemoryConfig>> {
    return { ...this.config };
  }

  /**
   * Get base directory
   */
  getBaseDir(): string {
    return this.config.baseDir;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /**
   * Export team registry state
   */
  toJSON(): object {
    return {
      config: this.config,
      teams: Array.from(this.teams.entries()),
      members: Array.from(this.members.entries()),
    };
  }

  /**
   * Import team registry state
   */
  fromJSON(data: ReturnType<TeamMemoryPaths['toJSON']>): void {
    const d = data as { config: Required<TeamMemoryConfig>; teams: [string, TeamMemoryPath][]; members: [string, TeamMemberContext[]][] };
    this.config = d.config;
    this.teams = new Map(d.teams);
    this.members = new Map(d.members);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let teamMemoryPaths: TeamMemoryPaths | null = null;

export function getTeamMemoryPaths(config?: TeamMemoryConfig): TeamMemoryPaths {
  if (!teamMemoryPaths) {
    teamMemoryPaths = new TeamMemoryPaths(config);
  }
  return teamMemoryPaths;
}

export function resetTeamMemoryPaths(): void {
  teamMemoryPaths = null;
}

// ============================================================================
// Team Memory Prompts
// ============================================================================

/**
 * Generate system prompt segment for team context
 */
export function generateTeamPrompt(teamId: string, memberId: string): string {
  const teamPaths = getTeamMemoryPaths().getOrCreateTeamPaths(teamId);
  const members = getTeamMemoryPaths().getTeamMembers(teamId);

  const memberNames = members.map(m => m.memberId).join(', ');

  return `
## Team Context
- Team: ${teamId}
- Members: ${memberNames || 'None'}
- Your role: ${getTeamMemoryPaths().getMember(memberId, teamId)?.role ?? 'member'}

## Shared Memory
The team maintains shared context at: ${teamPaths.sharedMemoryPath}
Team-specific context at: ${teamPaths.contextPath}
`.trim();
}

/**
 * Load shared team memory content
 */
export async function loadTeamSharedMemory(teamId: string): Promise<string | null> {
  const teamPaths = getTeamMemoryPaths().getTeamPaths(teamId);
  if (!teamPaths) return null;

  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(teamPaths.sharedMemoryPath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

/**
 * Save shared team memory content
 */
export async function saveTeamSharedMemory(teamId: string, content: string): Promise<void> {
  const teamPaths = getTeamMemoryPaths().getOrCreateTeamPaths(teamId);

  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(teamPaths.rootDir, { recursive: true });
  await writeFile(teamPaths.sharedMemoryPath, content, 'utf-8');
}

// ============================================================================
// Module Exports
// ============================================================================

export const teamMem = {
  TeamMemoryPaths,
  getTeamMemoryPaths,
  resetTeamMemoryPaths,
  generateTeamPrompt,
  loadTeamSharedMemory,
  saveTeamSharedMemory,
};
