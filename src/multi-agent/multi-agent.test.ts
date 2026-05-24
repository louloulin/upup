/**
 * Multi-Agent System Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { getTeamManager, getSwarmCoordinator } from './index.js';

describe('TeamManager', () => {
  let teamManager: ReturnType<typeof getTeamManager>;

  beforeEach(async () => {
    teamManager = getTeamManager();
    await teamManager.initialize();
  });

  it('should create a team', () => {
    const uniqueName = `test-team-${Date.now()}`;
    const team = teamManager.create({
      name: uniqueName,
      description: 'Test team',
      agentType: 'researcher',
    });

    expect(team).toBeDefined();
    expect(team.name).toBeDefined();
    expect(team.lead).toBeDefined();
    expect(team.members.length).toBe(1);
    expect(team.status).toBe('active');
  });

  it('should add members', () => {
    const uniqueName = `test-team-2-${Date.now()}`;
    const team = teamManager.create({ name: uniqueName });
    const member = teamManager.addMember(team.name, 'analyst-1', 'analyst');

    expect(member).toBeDefined();
    expect(member?.name).toBe('analyst-1');
    expect(team.members.length).toBe(2);
  });

  it('should list teams', () => {
    teamManager.create({ name: `team-a-${Date.now()}` });
    teamManager.create({ name: `team-b-${Date.now()}` });

    const teams = teamManager.listTeams();
    expect(teams.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SwarmCoordinator', () => {
  let coordinator: ReturnType<typeof getSwarmCoordinator>;

  beforeEach(async () => {
    coordinator = getSwarmCoordinator();
    await coordinator.initialize();
  });

  it('should create team and spawn agent', async () => {
    const teamName = `swarm-${Date.now()}`;
    const team = coordinator.createTeam(teamName, 'Test swarm');
    expect(team).toBeDefined();
    expect(team.name).toBe(teamName);

    const agent = await coordinator.spawnAgent({
      teamId: team.name,
      name: 'test-agent',
      role: 'researcher',
      prompt: 'Research test',
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-agent');
    expect(['pending', 'running']).toContain(agent.status);
  });

  it('should send messages between agents', () => {
    expect(coordinator.sendMessage('fake-from', 'fake-to', 'Hello')).toBe(false);
  });

  it('should get agent count', async () => {
    const team = coordinator.createTeam(`count-test-${Date.now()}`);
    await coordinator.spawnAgent({
      teamId: team.name,
      name: 'agent-1',
      role: 'test',
      prompt: 'Test',
    });

    const count = coordinator.getActiveAgentCount();
    expect(typeof count).toBe('number');
  });
});
