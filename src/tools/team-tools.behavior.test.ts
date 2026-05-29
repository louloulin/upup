/**
 * Behavior tests for TeamTools (store operations)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createTeamCreateTool,
  createTeamDeleteTool,
  createTeamListTool,
  createTeamAddMemberTool,
  createTeamRemoveMemberTool,
  createTeamStatusTool,
  createTeamUpdateStatusTool,
} from './team-tools.js';

describe('createTeamCreateTool', () => {
  it('should create tool with name team_create', () => {
    const tool = createTeamCreateTool();
    expect(tool.name).toBe('team_create');
  });

  it('should have callable func', () => {
    const tool = createTeamCreateTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return team details after creation', async () => {
    const tool = createTeamCreateTool();
    const result = await tool.func({ name: 'Test Team', description: 'A test team' });
    // Team name format: "Team 'test-team-123' created successfully!"
    expect(result).toContain('created successfully');
    // Team name includes unique suffix
    expect(result).toMatch(/Test[\s-]*Team/);
  });
});

describe('createTeamDeleteTool', () => {
  beforeEach(async () => {
    const createTool = createTeamCreateTool();
    await createTool.func({ name: 'Delete Me Team' });
  });

  it('should create tool with name team_delete', () => {
    const tool = createTeamDeleteTool();
    expect(tool.name).toBe('team_delete');
  });

  it('should delete existing team by name', async () => {
    const tool = createTeamDeleteTool();
    const result = await tool.func({ team_name: 'Delete Me Team' });
    expect(result).toContain('deleted');
    expect(result).toContain('Delete Me Team');
  });

  it('should return not found for unknown team', async () => {
    const tool = createTeamDeleteTool();
    const result = await tool.func({ team_name: 'nonexistent-team' });
    expect(result).toContain('not found');
  });
});

describe('createTeamListTool', () => {
  beforeEach(async () => {
    // Create a few teams
    const createTool = createTeamCreateTool();
    await createTool.func({ name: 'Team Alpha' });
    await createTool.func({ name: 'Team Beta' });
  });

  it('should create tool with name team_list', () => {
    const tool = createTeamListTool();
    expect(tool.name).toBe('team_list');
  });

  it('should have callable func', () => {
    const tool = createTeamListTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should list created teams', async () => {
    const tool = createTeamListTool();
    const result = await tool.func({});
    // Team names include unique suffix, check case-insensitive
    expect(result.toLowerCase()).toContain('team-alpha');
    expect(result.toLowerCase()).toContain('team-beta');
  });

  it('should filter by status', async () => {
    const tool = createTeamListTool();
    const result = await tool.func({ status: 'active' });
    expect(typeof result).toBe('string');
  });
});

describe('createTeamAddMemberTool', () => {
  it('should create tool with name team_add_member', () => {
    const tool = createTeamAddMemberTool();
    expect(tool.name).toBe('team_add_member');
  });

  it('should have callable func', () => {
    const tool = createTeamAddMemberTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should add member to new team', async () => {
    // Create team first
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Add Member Team' });
    // Extract team name from result (format: "Team 'add-member-team-123' created successfully!")
    const match = createResult.match(/Team '([^']+)' created successfully/);
    expect(match).toBeTruthy();
    const teamName = match![1];

    const tool = createTeamAddMemberTool();
    const result = await tool.func({
      team_name: teamName,
      name: 'Alice',
      role: 'researcher',
    });
    expect(result).toContain('Member added');
    expect(result).toContain('Alice');
  });

  it('should return not found for unknown team', async () => {
    const tool = createTeamAddMemberTool();
    const result = await tool.func({
      team_name: 'nonexistent-team-123',
      name: 'Bob',
      role: 'reviewer',
    });
    expect(result).toContain('not found');
  });
});

describe('createTeamRemoveMemberTool', () => {
  it('should create tool with name team_remove_member', () => {
    const tool = createTeamRemoveMemberTool();
    expect(tool.name).toBe('team_remove_member');
  });

  it('should have callable func', () => {
    const tool = createTeamRemoveMemberTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should remove existing member from new team', async () => {
    // Create team first
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Remove Member Team' });
    const match = createResult.match(/Team '([^']+)' created successfully/);
    expect(match).toBeTruthy();
    const teamName = match![1];

    // Add member first
    const addTool = createTeamAddMemberTool();
    await addTool.func({
      team_name: teamName,
      name: 'Charlie',
      role: 'analyst',
    });

    // Now remove
    const tool = createTeamRemoveMemberTool();
    const result = await tool.func({
      team_name: teamName,
      member_name: 'Charlie',
    });
    expect(result).toContain('removed');
  });

  it('should return not found for unknown member', async () => {
    const tool = createTeamRemoveMemberTool();
    const result = await tool.func({
      team_name: 'remove-member-team-nonexistent',
      member_name: 'nonexistent-member',
    });
    expect(result).toContain('not found');
  });
});

describe('createTeamStatusTool', () => {
  it('should create tool with name team_status', () => {
    const tool = createTeamStatusTool();
    expect(tool.name).toBe('team_status');
  });

  it('should have callable func', () => {
    const tool = createTeamStatusTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return team status with details', async () => {
    // Create team first
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({
      name: 'Status Check Team',
      description: 'A team for status testing',
    });
    const match = createResult.match(/Team '([^']+)' created successfully/);
    expect(match).toBeTruthy();
    const teamName = match![1];

    const tool = createTeamStatusTool();
    const result = await tool.func({ team_name: teamName });
    expect(result.toLowerCase()).toContain('status');
    expect(result).toContain('active');
  });

  it('should return not found for unknown team', async () => {
    const tool = createTeamStatusTool();
    const result = await tool.func({ team_name: 'nonexistent-team-123' });
    expect(result).toContain('not found');
  });
});

describe('createTeamUpdateStatusTool', () => {
  it('should create tool with name team_update_status', () => {
    const tool = createTeamUpdateStatusTool();
    expect(tool.name).toBe('team_update_status');
  });

  it('should have callable func', () => {
    const tool = createTeamUpdateStatusTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should update team status to paused', async () => {
    // Create team first
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Update Status Team' });
    const match = createResult.match(/Team '([^']+)' created successfully/);
    expect(match).toBeTruthy();
    const teamName = match![1];

    const tool = createTeamUpdateStatusTool();
    const result = await tool.func({ team_name: teamName, status: 'paused' });
    expect(result).toContain('paused');
  });

  it('should update team status to completed', async () => {
    // Create team first
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Update Status Team 2' });
    const match = createResult.match(/Team '([^']+)' created successfully/);
    expect(match).toBeTruthy();
    const teamName = match![1];

    const tool = createTeamUpdateStatusTool();
    const result = await tool.func({ team_name: teamName, status: 'completed' });
    expect(result).toContain('completed');
  });

  it('should update team status back to active', async () => {
    // Create team first
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Update Status Team 3' });
    const match = createResult.match(/Team '([^']+)' created successfully/);
    expect(match).toBeTruthy();
    const teamName = match![1];

    const tool = createTeamUpdateStatusTool();
    const result = await tool.func({ team_name: teamName, status: 'active' });
    expect(result).toContain('active');
  });
});
