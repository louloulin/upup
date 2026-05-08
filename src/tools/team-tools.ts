/**
 * TeamTools - Team creation and management
 *
 * Allows agents to create teams, add/remove members, and manage team state.
 * Each team has its own memory store and member list.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { agentMemoryStore } from '../agent/subagent/types.js';

/** Get the global agent memory store */
function getMemoryStore() {
  return agentMemoryStore;
}

// ============================================================================
// Types
// ============================================================================

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  joinedAt: number;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  createdAt: number;
  status: 'active' | 'paused' | 'completed';
}

// ============================================================================
// Team Store (singleton)
// ============================================================================

const teamStore = new Map<string, Team>();

function createTeamId(): string {
  return `team-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getTeam(teamId: string): Team | undefined {
  return teamStore.get(teamId);
}

function createTeam(name: string, description: string): Team {
  const team: Team = {
    id: createTeamId(),
    name,
    description,
    members: [],
    createdAt: Date.now(),
    status: 'active',
  };
  teamStore.set(team.id, team);
  return team;
}

function deleteTeam(teamId: string): boolean {
  const team = teamStore.get(teamId);
  if (!team) return false;

  // Clean up agent memory for all members (best-effort)
  for (const member of team.members) {
    try {
      getMemoryStore().deleteByAgent(member.id);
    } catch {
      // Ignore cleanup errors
    }
  }

  teamStore.delete(teamId);
  return true;
}

function listTeams(): Team[] {
  return Array.from(teamStore.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function addTeamMember(
  teamId: string,
  name: string,
  role: string
): TeamMember | null {
  const team = teamStore.get(teamId);
  if (!team) return null;

  const member: TeamMember = {
    id: `${teamId}-${name}-${Date.now()}`,
    name,
    role,
    joinedAt: Date.now(),
  };

  team.members.push(member);
  return member;
}

function removeTeamMember(teamId: string, memberId: string): boolean {
  const team = teamStore.get(teamId);
  if (!team) return false;

  const index = team.members.findIndex(m => m.id === memberId);
  if (index === -1) return false;

  const [removed] = team.members.splice(index, 1);
  try {
    getMemoryStore().deleteByAgent(removed.id);
  } catch {
    // Ignore cleanup errors
  }
  return true;
}

function updateTeamStatus(
  teamId: string,
  status: Team['status']
): boolean {
  const team = teamStore.get(teamId);
  if (!team) return false;
  team.status = status;
  return true;
}

// ============================================================================
// Schemas
// ============================================================================

export const TeamCreateSchema = z.object({
  /** Name for the new team */
  name: z.string().min(1).max(100).describe('Name for the new team'),
  /** Optional description of the team's purpose */
  description: z.string().max(500).optional().describe('Description of the team\'s purpose'),
});

export const TeamDeleteSchema = z.object({
  /** ID of the team to delete */
  team_id: z.string().min(1).describe('ID of the team to delete'),
});

export const TeamListSchema = z.object({
  /** Filter by status */
  status: z.enum(['active', 'paused', 'completed']).optional().describe('Filter teams by status'),
  /** Maximum number of teams to return */
  limit: z.number().min(1).max(100).optional().describe('Maximum number of teams to return'),
});

export const TeamAddMemberSchema = z.object({
  /** ID of the team to add the member to */
  team_id: z.string().min(1).describe('ID of the team'),
  /** Name/identifier for the member */
  name: z.string().min(1).max(50).describe('Name for the team member'),
  /** Role of the member in the team */
  role: z.string().min(1).max(100).describe('Role of the member (e.g., researcher, reviewer)'),
});

export const TeamRemoveMemberSchema = z.object({
  /** ID of the team */
  team_id: z.string().min(1).describe('ID of the team'),
  /** ID of the member to remove */
  member_id: z.string().min(1).describe('ID of the member to remove'),
});

export const TeamStatusSchema = z.object({
  /** ID of the team to get status for */
  team_id: z.string().min(1).describe('ID of the team'),
});

export const TeamUpdateStatusSchema = z.object({
  /** ID of the team */
  team_id: z.string().min(1).describe('ID of the team'),
  /** New status */
  status: z.enum(['active', 'paused', 'completed']).describe('New status for the team'),
});

// ============================================================================
// Tool Descriptions
// ============================================================================

export const TEAM_CREATE_DESCRIPTION = `
Create a new team for multi-agent collaboration.

Use this when:
- Setting up a research team with multiple specialized agents
- Organizing agents for a complex task requiring different roles
- Creating a structured group workflow

A team provides shared context and organized membership for multiple agents.
After creating a team, use team_add_member to add agents to it.

Examples:
- Create a research team: name: 'market-research', description: 'Stock analysis team'
- Create a code review team: name: 'pr-review'`;

export const TEAM_DELETE_DESCRIPTION = `
Delete a team and clean up all associated resources.

Use this when:
- A team's work is complete
- Team resources need to be freed
- Resetting team state

Warning: This will remove all team members and their associated memory.`;

export const TEAM_LIST_DESCRIPTION = `
List all teams, optionally filtered by status.

Use this when:
- Checking active teams
- Finding a team by ID
- Overview of team landscape

Returns team summaries with member counts and status.`;

export const TEAM_ADD_MEMBER_DESCRIPTION = `
Add a member/agent to an existing team.

Use this when:
- Assigning a new agent to a team
- Adding a specialist to a research team
- Growing a team roster

The member will have a unique ID within the team and can receive messages
via the send_message tool with their ID as the recipient.`;

export const TEAM_REMOVE_MEMBER_DESCRIPTION = `
Remove a member from a team.

Use this when:
- An agent's work is complete
- Reorganizing team membership
- Cleaning up inactive members`;

export const TEAM_STATUS_DESCRIPTION = `
Get detailed status of a specific team.

Use this when:
- Checking team progress
- Viewing all team members
- Verifying team health

Returns full team details including all members and their roles.`;

export const TEAM_UPDATE_STATUS_DESCRIPTION = `
Update the status of a team (active, paused, completed).

Use this when:
- Pausing a team's work
- Marking a team as completed
- Resuming a paused team`;

// ============================================================================
// Tool Factories
// ============================================================================

export function createTeamCreateTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_create',
    description: TEAM_CREATE_DESCRIPTION,
    schema: TeamCreateSchema,
    async func(input): Promise<string> {
      const team = createTeam(input.name, input.description ?? '');

      return [
        `Team created successfully!`,
        ``,
        `Team ID: ${team.id}`,
        `Name: ${team.name}`,
        `Description: ${team.description || '(none)'}`,
        `Status: ${team.status}`,
        ``,
        `Add members with team_add_member.`,
      ].join('\n');
    },
  });
}

export function createTeamDeleteTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_delete',
    description: TEAM_DELETE_DESCRIPTION,
    schema: TeamDeleteSchema,
    async func(input): Promise<string> {
      const team = getTeam(input.team_id);
      if (!team) {
        return `Team '${input.team_id}' not found. Use team_list to see available teams.`;
      }

      const deleted = deleteTeam(input.team_id);
      if (deleted) {
        return `Team '${team.name}' (${input.team_id}) deleted. ${team.members.length} member(s) removed.`;
      }
      return `Failed to delete team.`;
    },
  });
}

export function createTeamListTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_list',
    description: TEAM_LIST_DESCRIPTION,
    schema: TeamListSchema,
    async func(input): Promise<string> {
      let teams = listTeams();

      if (input.status) {
        teams = teams.filter(t => t.status === input.status);
      }

      const limit = input.limit ?? 50;
      const shown = teams.slice(0, limit);

      if (shown.length === 0) {
        return `No teams found${input.status ? ` with status '${input.status}'` : ''}.`;
      }

      const lines = [`Teams (${shown.length}${input.status ? `, status: ${input.status}` : ''}):\n`];

      for (const team of shown) {
        const statusIcon = team.status === 'active' ? '🟢' : team.status === 'paused' ? '⏸️' : '✅';
        lines.push(`${statusIcon} ${team.name} (${team.id})`);
        lines.push(`   Members: ${team.members.length} | Created: ${new Date(team.createdAt).toLocaleString()}`);
        lines.push('');
      }

      if (teams.length > limit) {
        lines.push(`... and ${teams.length - limit} more (use limit to narrow)`);
      }

      return lines.join('\n');
    },
  });
}

export function createTeamAddMemberTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_add_member',
    description: TEAM_ADD_MEMBER_DESCRIPTION,
    schema: TeamAddMemberSchema,
    async func(input): Promise<string> {
      const team = getTeam(input.team_id);
      if (!team) {
        return `Team '${input.team_id}' not found. Use team_list to see available teams.`;
      }

      if (team.status !== 'active') {
        return `Cannot add members to a ${team.status} team. Update status to 'active' first.`;
      }

      const member = addTeamMember(input.team_id, input.name, input.role);
      if (!member) {
        return `Failed to add member to team.`;
      }

      return [
        `Member added to team '${team.name}'!`,
        ``,
        `Member ID: ${member.id}`,
        `Name: ${member.name}`,
        `Role: ${member.role}`,
        ``,
        `Send messages to this member using send_message tool with to: '${member.id}'.`,
      ].join('\n');
    },
  });
}

export function createTeamRemoveMemberTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_remove_member',
    description: TEAM_REMOVE_MEMBER_DESCRIPTION,
    schema: TeamRemoveMemberSchema,
    async func(input): Promise<string> {
      const team = getTeam(input.team_id);
      if (!team) {
        return `Team '${input.team_id}' not found.`;
      }

      const member = team.members.find(m => m.id === input.member_id);
      if (!member) {
        return `Member '${input.member_id}' not found in team.`;
      }

      const removed = removeTeamMember(input.team_id, input.member_id);
      if (removed) {
        return `Member '${member.name}' removed from team '${team.name}'.`;
      }
      return `Failed to remove member.`;
    },
  });
}

export function createTeamStatusTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_status',
    description: TEAM_STATUS_DESCRIPTION,
    schema: TeamStatusSchema,
    async func(input): Promise<string> {
      const team = getTeam(input.team_id);
      if (!team) {
        return `Team '${input.team_id}' not found. Use team_list to see available teams.`;
      }

      const statusIcon = team.status === 'active' ? '🟢' : team.status === 'paused' ? '⏸️' : '✅';
      const lines = [
        `=== Team: ${team.name} ===`,
        `ID: ${team.id}`,
        `Status: ${statusIcon} ${team.status}`,
        `Description: ${team.description || '(none)'}`,
        `Created: ${new Date(team.createdAt).toLocaleString()}`,
        ``,
        `Members (${team.members.length}):`,
      ];

      if (team.members.length === 0) {
        lines.push('  (no members)');
      } else {
        for (const member of team.members) {
          lines.push(`  - ${member.name} (${member.role})`);
          lines.push(`    ID: ${member.id} | Joined: ${new Date(member.joinedAt).toLocaleString()}`);
        }
      }

      return lines.join('\n');
    },
  });
}

export function createTeamUpdateStatusTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_update_status',
    description: TEAM_UPDATE_STATUS_DESCRIPTION,
    schema: TeamUpdateStatusSchema,
    async func(input): Promise<string> {
      const team = getTeam(input.team_id);
      if (!team) {
        return `Team '${input.team_id}' not found.`;
      }

      const updated = updateTeamStatus(input.team_id, input.status);
      if (!updated) {
        return `Failed to update team status.`;
      }

      const statusIcon = input.status === 'active' ? '🟢' : input.status === 'paused' ? '⏸️' : '✅';
      return `Team '${team.name}' status updated to ${statusIcon} ${input.status}.`;
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
