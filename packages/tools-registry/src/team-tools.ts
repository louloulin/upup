/**
 * TeamTools - Team creation and management (Unified with TeamManager)
 * 
 * 基于Claude Code teamHelpers设计，统一使用TeamManager作为单一数据源。
 * 提供团队创建、成员管理、状态更新等功能。
 * 
 * 改造说明:
 * - 删除teamStore内存存储，使用TeamManager
 * - 所有操作通过TeamManager API
 * - 支持文件持久化和自动清理
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { getTeamManager } from '@upup/coordinator-system/multi-agent/team-manager';

// ============================================================================
// Descriptions
// ============================================================================

export const TEAM_CREATE_DESCRIPTION = `Create a new team for multi-agent collaboration.
Teams allow multiple AI agents to work together on complex tasks.
Each team has a lead agent and can spawn multiple member agents.
Example use cases: research teams, code review teams, analysis teams.`;

export const TEAM_DELETE_DESCRIPTION = `Delete an existing team and clean up all associated data.`;

export const TEAM_LIST_DESCRIPTION = `List all existing teams with their status and member counts.
Use this to find teams to join or manage.`;

export const TEAM_ADD_MEMBER_DESCRIPTION = `Add a new member to an existing team.
Members can be assigned specific roles like 'researcher', 'reviewer', or 'analyst'.`;

export const TEAM_REMOVE_MEMBER_DESCRIPTION = `Remove a member from a team.
The member will no longer receive messages or participate in team tasks.`;

export const TEAM_STATUS_DESCRIPTION = `Get detailed status of a specific team including all members.`;

export const TEAM_UPDATE_STATUS_DESCRIPTION = `Update the status of a team (active/paused/completed).
Pausing a team suspends all member activity until resumed.`;

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
  /** Name of the team to delete */
  team_name: z.string().min(1).describe('Name of the team to delete'),
});

export const TeamListSchema = z.object({
  /** Filter by status */
  status: z.enum(['active', 'paused', 'completed']).optional().describe('Filter teams by status'),
  /** Maximum number of teams to return */
  limit: z.number().min(1).max(100).optional().describe('Maximum number of teams to return'),
});

export const TeamAddMemberSchema = z.object({
  /** Name of the team to add the member to */
  team_name: z.string().min(1).describe('Name of the team'),
  /** Name/identifier for the member */
  name: z.string().min(1).max(50).describe('Name for the team member'),
  /** Role of the member in the team */
  role: z.string().min(1).max(100).describe('Role of the member (e.g., researcher, reviewer)'),
});

export const TeamRemoveMemberSchema = z.object({
  /** Name of the team */
  team_name: z.string().min(1).describe('Name of the team'),
  /** Name of the member to remove */
  member_name: z.string().min(1).describe('Name of the member to remove'),
});

export const TeamStatusSchema = z.object({
  /** Name of the team to get status for */
  team_name: z.string().min(1).describe('Name of the team'),
});

export const TeamUpdateStatusSchema = z.object({
  /** Name of the team */
  team_name: z.string().min(1).describe('Name of the team'),
  /** New status */
  status: z.enum(['active', 'paused', 'completed']).describe('New status for the team'),
});

// ============================================================================
// Tool Creators
// ============================================================================

export function createTeamCreateTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_create',
    description: TEAM_CREATE_DESCRIPTION,
    schema: TeamCreateSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        await manager.initialize();

        const team = manager.create({
          name: input.name,
          description: input.description,
        });

        const teamPath = manager.getTeamFilePath(team.name);

        return [
          `Team '${team.name}' created successfully!`,
          ``,
          `Lead: ${team.lead}`,
          `Description: ${team.description || '(none)'}`,
          `Created: ${new Date(team.createdAt).toLocaleString()}`,
          ``,
          `File: ${teamPath || 'N/A'}`,
        ].join('\n');
      } catch (error) {
        return `Failed to create team: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function createTeamDeleteTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_delete',
    description: TEAM_DELETE_DESCRIPTION,
    schema: TeamDeleteSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        
        const deleted = manager.deleteTeam(input.team_name);
        if (deleted) {
          return `Team '${input.team_name}' deleted successfully.`;
        }
        return `Team '${input.team_name}' not found or already deleted.`;
      } catch (error) {
        return `Failed to delete team: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function createTeamListTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_list',
    description: TEAM_LIST_DESCRIPTION,
    schema: TeamListSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        await manager.initialize();

        let teams = manager.listTeams();

        // Filter by status if specified
        if (input.status) {
          teams = teams.filter(t => t.status === input.status);
        }

        // Sort by created time (newest first)
        teams.sort((a, b) => b.createdAt - a.createdAt);

        // Apply limit
        const limit = input.limit ?? 50;
        const shown = teams.slice(0, limit);

        if (shown.length === 0) {
          return `No teams found${input.status ? ` with status '${input.status}'` : ''}.`;
        }

        const lines = [`Teams (${shown.length}${input.status ? `, status: ${input.status}` : ''}):\n`];

        for (const team of shown) {
          const statusIcon = team.status === 'active' ? '🟢' : team.status === 'paused' ? '⏸️' : '✅';
          lines.push(`${statusIcon} ${team.name}`);
          lines.push(`   Lead: ${team.lead} | Members: ${team.members.length} | Created: ${new Date(team.createdAt).toLocaleString()}`);
          if (team.description) {
            lines.push(`   Description: ${team.description}`);
          }
          lines.push('');
        }

        if (teams.length > limit) {
          lines.push(`... and ${teams.length - limit} more (use limit to narrow)`);
        }

        return lines.join('\n');
      } catch (error) {
        return `Failed to list teams: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function createTeamAddMemberTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_add_member',
    description: TEAM_ADD_MEMBER_DESCRIPTION,
    schema: TeamAddMemberSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        await manager.initialize();

        const member = manager.addMember(input.team_name, input.name, input.role);
        if (!member) {
          return `Team '${input.team_name}' not found. Use team_list to see available teams.`;
        }

        return [
          `Member added to team '${input.team_name}'!`,
          ``,
          `Member ID: ${member.id}`,
          `Name: ${member.name}`,
          `Role: ${member.role}`,
          ``,
          `Use send_message tool to communicate with this member.`,
        ].join('\n');
      } catch (error) {
        return `Failed to add member: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function createTeamRemoveMemberTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_remove_member',
    description: TEAM_REMOVE_MEMBER_DESCRIPTION,
    schema: TeamRemoveMemberSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        await manager.initialize();

        // Find member by name
        const team = manager.getTeam(input.team_name);
        if (!team) {
          return `Team '${input.team_name}' not found.`;
        }

        const member = team.members.find(m => m.name === input.member_name);
        if (!member) {
          return `Member '${input.member_name}' not found in team.`;
        }

        const removed = manager.removeMember(input.team_name, member.id);
        if (removed) {
          return `Member '${input.member_name}' removed from team '${input.team_name}'.`;
        }
        return `Failed to remove member.`;
      } catch (error) {
        return `Failed to remove member: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function createTeamStatusTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_status',
    description: TEAM_STATUS_DESCRIPTION,
    schema: TeamStatusSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        await manager.initialize();

        const team = manager.getTeam(input.team_name);
        if (!team) {
          return `Team '${input.team_name}' not found. Use team_list to see available teams.`;
        }

        const statusIcon = team.status === 'active' ? '🟢' : team.status === 'paused' ? '⏸️' : '✅';
        const lines = [
          `=== Team: ${team.name} ===`,
          `Lead: ${team.lead}`,
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
            lines.push(`    Status: ${member.status} | Joined: ${new Date(member.joinedAt).toLocaleString()}`);
          }
        }

        return lines.join('\n');
      } catch (error) {
        return `Failed to get team status: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function createTeamUpdateStatusTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'team_update_status',
    description: TEAM_UPDATE_STATUS_DESCRIPTION,
    schema: TeamUpdateStatusSchema,
    async func(input): Promise<string> {
      try {
        const manager = getTeamManager();
        await manager.initialize();

        const updated = manager.updateTeamStatus(input.team_name, input.status);
        if (!updated) {
          return `Team '${input.team_name}' not found.`;
        }

        const statusIcon = input.status === 'active' ? '🟢' : input.status === 'paused' ? '⏸️' : '✅';
        return `Team '${input.team_name}' status updated to ${statusIcon} ${input.status}.`;
      } catch (error) {
        return `Failed to update team status: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================

export const teamTools = [
  createTeamCreateTool,
  createTeamDeleteTool,
  createTeamListTool,
  createTeamAddMemberTool,
  createTeamRemoveMemberTool,
  createTeamStatusTool,
  createTeamUpdateStatusTool,
];
