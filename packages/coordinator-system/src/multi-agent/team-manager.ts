/**
 * Team Manager - 基于Claude Code TeamCreate设计
 * 
 * Features:
 * - Team creation with file persistence
 * - Member management
 * - Team status tracking
 * - JSON-based team files
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { upupPath } from '@upup/utils/paths';
import { randomUUID } from 'crypto';
import type { TeamFile, TeamMember, CreateTeamParams } from './types.js';
import { info, warn, error as logError } from '@upup/utils/logging';
import { registerTeamForSessionCleanup, unregisterTeamForSessionCleanup } from './session-cleanup.js';

const TEAMS_DIR = 'teams';

function getTeamsDir(): string {
  const dir = upupPath(TEAMS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getTeamFilePath(teamName: string): string {
  return join(getTeamsDir(), `${sanitizeTeamName(teamName)}.json`);
}

function sanitizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

function generateUniqueTeamName(baseName: string): string {
  const sanitized = sanitizeTeamName(baseName);
  const filePath = getTeamFilePath(sanitized);
  
  if (!existsSync(filePath)) {
    return sanitized;
  }
  
  // Generate unique name with suffix
  let counter = 1;
  let uniqueName = `${sanitized}-${counter}`;
  while (existsSync(getTeamFilePath(uniqueName))) {
    counter++;
    uniqueName = `${sanitized}-${counter}`;
  }
  return uniqueName;
}

/**
 * Team Manager - manages team lifecycle
 */
export class TeamManager {
  private teams: Map<string, TeamFile> = new Map();
  private initialized = false;

  /**
   * Initialize team manager - load existing teams from disk
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const teamsDir = getTeamsDir();
    if (!existsSync(teamsDir)) {
      mkdirSync(teamsDir, { recursive: true });
      this.initialized = true;
      return;
    }

    try {
      const { readdirSync } = await import('fs');
      const files = readdirSync(teamsDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        try {
          const filePath = join(teamsDir, file);
          const content = readFileSync(filePath, 'utf-8');
          const team: TeamFile = JSON.parse(content);
          this.teams.set(team.name, team);
        } catch (e) {
          warn('daemon', `Failed to load team file: ${file}`, e instanceof Error ? e : undefined);
        }
      }
      
      info('daemon', `Initialized with ${this.teams.size} teams`);
      this.initialized = true;
    } catch (e) {
      logError('daemon', 'Failed to initialize team manager', e instanceof Error ? e : undefined);
    }
  }

  /**
   * Create a new team
   */
  create(params: CreateTeamParams): TeamFile {
    const teamName = generateUniqueTeamName(params.name);
    
    const lead: TeamMember = {
      id: randomUUID(),
      name: `${params.name}-lead`,
      role: params.agentType ?? 'lead',
      status: 'active',
      joinedAt: Date.now(),
      lastActivity: Date.now(),
    };

    const team: TeamFile = {
      name: teamName,
      lead: lead.id,
      members: [lead],
      description: params.description ?? '',
      createdAt: Date.now(),
      status: 'active',
    };

    this.teams.set(teamName, team);
    this.persistTeam(team);
    
    info('daemon', `Created team: ${teamName}`);
    return team;
  }

  /**
   * Get team by name
   */
  getTeam(teamName: string): TeamFile | undefined {
    return this.teams.get(teamName);
  }

  /**
   * List all teams
   */
  listTeams(): TeamFile[] {
    return Array.from(this.teams.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Add member to team
   */
  addMember(teamName: string, name: string, role: string): TeamMember | null {
    const team = this.teams.get(teamName);
    if (!team) return null;

    const member: TeamMember = {
      id: randomUUID(),
      name,
      role,
      status: 'idle',
      joinedAt: Date.now(),
      lastActivity: Date.now(),
    };

    team.members.push(member);
    this.persistTeam(team);
    
    info('daemon', `Added member ${name} to team ${teamName}`);
    return member;
  }

  /**
   * Remove member from team
   */
  removeMember(teamName: string, memberId: string): boolean {
    const team = this.teams.get(teamName);
    if (!team) return false;

    const index = team.members.findIndex(m => m.id === memberId);
    if (index === -1) return false;

    // Cannot remove lead
    if (memberId === team.lead) return false;

    team.members.splice(index, 1);
    this.persistTeam(team);
    
    info('daemon', `Removed member ${memberId} from team ${teamName}`);
    return true;
  }

  /**
   * Update member status
   */
  updateMemberStatus(teamName: string, memberId: string, status: TeamMember['status']): boolean {
    const team = this.teams.get(teamName);
    if (!team) return false;

    const member = team.members.find(m => m.id === memberId);
    if (!member) return false;

    member.status = status;
    member.lastActivity = Date.now();
    this.persistTeam(team);
    return true;
  }

  /**
   * Update team status
   */
  updateTeamStatus(teamName: string, status: TeamFile['status']): boolean {
    const team = this.teams.get(teamName);
    if (!team) return false;

    team.status = status;
    this.persistTeam(team);
    return true;
  }

  /**
   * Delete team
   */
  deleteTeam(teamName: string): boolean {
    const team = this.teams.get(teamName);
    if (!team) return false;

    // Remove from memory
    this.teams.delete(teamName);
    
    // Unregister from session cleanup
    unregisterTeamForSessionCleanup(teamName);

    // Remove file
    const filePath = getTeamFilePath(teamName);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch (e) {
        warn('daemon', `Failed to delete team file: ${filePath}`, e instanceof Error ? e : undefined);
      }
    }

    info('daemon', `Deleted team: ${teamName}`);
    return true;
  }

  /**
   * Persist team to disk
   */
  private persistTeam(team: TeamFile): void {
    try {
      const filePath = getTeamFilePath(team.name);
      const dir = dirname(filePath);
      
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(filePath, JSON.stringify(team, null, 2), 'utf-8');
    } catch (e) {
      logError('daemon', `Failed to persist team: ${team.name}`, e instanceof Error ? e : undefined);
    }
  }

  /**
   * Get team file path for external use
   */
  getTeamFilePath(teamName: string): string | undefined {
    return this.teams.has(teamName) ? getTeamFilePath(teamName) : undefined;
  }

  /**
   * Clean up teams older than the specified age
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   */
  cleanupOldTeams(maxAgeMs: number = 86400000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;
    
    // Test/verification team name patterns
    const testPatterns = /^(test-|spawn-|verify-|count-|stats-|swarm-|concurrent-|complete-|msg-|persist-|team-[ab]-)/;
    
    for (const [name, team] of this.teams.entries()) {
      const ts = team.createdAt;
      
      // Clean if:
      // 1. Name matches test patterns (verification artifacts)
      // 2. Timestamp looks like seconds stored as milliseconds
      // 3. Timestamp older than cutoff
      const tsAsSeconds = ts / 1000;
      const isSecondsAsMilliseconds = tsAsSeconds > 1900000000 && tsAsSeconds < 2100000000;
      const isTestTeam = testPatterns.test(name);
      
      if (isTestTeam || isSecondsAsMilliseconds || ts < cutoff) {
        this.deleteTeam(name);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      info('daemon', `Cleaned up ${cleaned} old teams`);
    }
    
    return cleaned;
  }
}

// Singleton instance
let teamManager: TeamManager | null = null;

export function getTeamManager(): TeamManager {
  if (!teamManager) {
    teamManager = new TeamManager();
  }
  return teamManager;
}
