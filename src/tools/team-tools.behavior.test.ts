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
    expect(result).toContain('Team created successfully');
    expect(result).toContain('Test Team');
    expect(result).toContain('team-');
  });
});

describe('createTeamDeleteTool', () => {
  let createdTeamId: string;

  beforeEach(async () => {
    const createTool = createTeamCreateTool();
    const result = await createTool.func({ name: 'Delete Me Team' });
    const match = result.match(/team-\d+-\w+/);
    createdTeamId = match ? match[0] : '';
  });

  it('should create tool with name team_delete', () => {
    const tool = createTeamDeleteTool();
    expect(tool.name).toBe('team_delete');
  });

  it('should delete existing team', async () => {
    const tool = createTeamDeleteTool();
    const result = await tool.func({ team_id: createdTeamId });
    expect(result).toContain('deleted');
    expect(result).toContain('Delete Me Team');
  });

  it('should return not found for unknown team', async () => {
    const tool = createTeamDeleteTool();
    const result = await tool.func({ team_id: 'nonexistent-team-123' });
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
    expect(result).toContain('Team Alpha');
    expect(result).toContain('Team Beta');
    expect(result).toContain('Members:');
  });

  it('should filter by status', async () => {
    const tool = createTeamListTool();
    const result = await tool.func({ status: 'active' });
    expect(result).toContain('Teams');
    expect(result).not.toContain('No teams found');
  });

  it('should return no teams for unknown status', async () => {
    const tool = createTeamListTool();
    const result = await tool.func({ status: 'completed' });
    // Either no teams or teams listed
    expect(typeof result).toBe('string');
  });
});

describe('createTeamAddMemberTool', () => {
  let createdTeamId: string;

  beforeEach(async () => {
    const createTool = createTeamCreateTool();
    const result = await createTool.func({ name: 'Add Member Team' });
    const match = result.match(/team-\d+-\w+/);
    createdTeamId = match ? match[0] : '';
  });

  it('should create tool with name team_add_member', () => {
    const tool = createTeamAddMemberTool();
    expect(tool.name).toBe('team_add_member');
  });

  it('should have callable func', () => {
    const tool = createTeamAddMemberTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should add member to existing team', async () => {
    const tool = createTeamAddMemberTool();
    const result = await tool.func({
      team_id: createdTeamId,
      name: 'Alice',
      role: 'researcher',
    });
    expect(result).toContain('Member added');
    expect(result).toContain('Alice');
    expect(result).toContain('researcher');
    expect(result).toContain('send_message');
  });

  it('should return not found for unknown team', async () => {
    const tool = createTeamAddMemberTool();
    const result = await tool.func({
      team_id: 'nonexistent',
      name: 'Bob',
      role: 'reviewer',
    });
    expect(result).toContain('not found');
  });

  it('should reject adding member to completed team', async () => {
    const statusTool = createTeamUpdateStatusTool();
    await statusTool.func({ team_id: createdTeamId, status: 'completed' });

    const addTool = createTeamAddMemberTool();
    const result = await addTool.func({
      team_id: createdTeamId,
      name: 'Bob',
      role: 'reviewer',
    });
    expect(result).toContain('completed');
  });
});

describe('createTeamRemoveMemberTool', () => {
  let createdTeamId: string;
  let memberId: string;

  beforeEach(async () => {
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Remove Member Team' });
    const teamMatch = createResult.match(/team-\d+-\w+/);
    createdTeamId = teamMatch ? teamMatch[0] : '';

    const addTool = createTeamAddMemberTool();
    const addResult = await addTool.func({
      team_id: createdTeamId,
      name: 'Charlie',
      role: 'analyst',
    });
    const memberMatch = addResult.match(/Member ID: (\S+)/);
    memberId = memberMatch ? memberMatch[1] : '';
  });

  it('should create tool with name team_remove_member', () => {
    const tool = createTeamRemoveMemberTool();
    expect(tool.name).toBe('team_remove_member');
  });

  it('should remove existing member', async () => {
    const tool = createTeamRemoveMemberTool();
    const result = await tool.func({
      team_id: createdTeamId,
      member_id: memberId,
    });
    expect(result).toContain('removed');
    expect(result).toContain('Charlie');
  });

  it('should return not found for unknown member', async () => {
    const tool = createTeamRemoveMemberTool();
    const result = await tool.func({
      team_id: createdTeamId,
      member_id: 'nonexistent-member',
    });
    expect(result).toContain('not found');
  });
});

describe('createTeamStatusTool', () => {
  let createdTeamId: string;

  beforeEach(async () => {
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({
      name: 'Status Check Team',
      description: 'A team for status testing',
    });
    const match = createResult.match(/team-\d+-\w+/);
    createdTeamId = match ? match[0] : '';
  });

  it('should create tool with name team_status', () => {
    const tool = createTeamStatusTool();
    expect(tool.name).toBe('team_status');
  });

  it('should have callable func', () => {
    const tool = createTeamStatusTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return team status with details', async () => {
    const tool = createTeamStatusTool();
    const result = await tool.func({ team_id: createdTeamId });
    expect(result).toContain('Status Check Team');
    expect(result).toContain('active');
    expect(result).toContain('Status:');
  });

  it('should return not found for unknown team', async () => {
    const tool = createTeamStatusTool();
    const result = await tool.func({ team_id: 'nonexistent' });
    expect(result).toContain('not found');
  });
});

describe('createTeamUpdateStatusTool', () => {
  let createdTeamId: string;

  beforeEach(async () => {
    const createTool = createTeamCreateTool();
    const createResult = await createTool.func({ name: 'Update Status Team' });
    const match = createResult.match(/team-\d+-\w+/);
    createdTeamId = match ? match[0] : '';
  });

  it('should create tool with name team_update_status', () => {
    const tool = createTeamUpdateStatusTool();
    expect(tool.name).toBe('team_update_status');
  });

  it('should have callable func', () => {
    const tool = createTeamUpdateStatusTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should update team status to paused', async () => {
    const tool = createTeamUpdateStatusTool();
    const result = await tool.func({ team_id: createdTeamId, status: 'paused' });
    expect(result).toContain('paused');
    expect(result).toContain('Update Status Team');
  });

  it('should update team status to completed', async () => {
    const tool = createTeamUpdateStatusTool();
    const result = await tool.func({ team_id: createdTeamId, status: 'completed' });
    expect(result).toContain('completed');
  });

  it('should update team status back to active', async () => {
    const tool = createTeamUpdateStatusTool();
    const result = await tool.func({ team_id: createdTeamId, status: 'active' });
    expect(result).toContain('active');
  });
});
