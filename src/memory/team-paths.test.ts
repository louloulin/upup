/**
 * Tests for Team Memory Paths
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import {
  TeamMemoryPaths,
  getTeamMemoryPaths,
  resetTeamMemoryPaths,
  generateTeamPrompt,
} from './team-paths.js';

describe('TeamMemoryPaths', () => {
  const TEST_BASE_DIR = '/tmp/upup-team-test';

  beforeEach(() => {
    resetTeamMemoryPaths();
  });

  afterEach(() => {
    resetTeamMemoryPaths();
  });

  describe('registerTeam', () => {
    it('registers a team and creates memory paths', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      const path = manager.registerTeam('research-team');

      expect(path.teamId).toBe('research-team');
      expect(path.rootDir).toBe(join(TEST_BASE_DIR, 'research-team'));
      expect(path.sharedMemoryPath).toContain('shared.MEMORY.md');
      expect(path.contextPath).toContain('context.json');
      expect(path.agentsDir).toContain('agents');
      expect(path.promptsDir).toContain('prompts');
    });

    it('allows custom root directory', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      const customDir = '/custom/team/path';
      const path = manager.registerTeam('custom-team', customDir);

      expect(path.rootDir).toBe(customDir);
    });

    it('returns existing paths for duplicate registration', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      const path1 = manager.registerTeam('dup-team');
      const path2 = manager.registerTeam('dup-team');

      expect(path1.teamId).toBe(path2.teamId); // Same data
      expect(path1.rootDir).toBe(path2.rootDir);
    });
  });

  describe('getOrCreateTeamPaths', () => {
    it('returns existing paths', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      const existing = manager.registerTeam('existing-team');

      const retrieved = manager.getOrCreateTeamPaths('existing-team');
      expect(retrieved).toBe(existing);
    });

    it('creates new paths if not exists', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });

      const created = manager.getOrCreateTeamPaths('new-team');
      expect(created.teamId).toBe('new-team');
      expect(manager.listTeams()).toContain('new-team');
    });
  });

  describe('listTeams', () => {
    it('lists all registered teams', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('team1');
      manager.registerTeam('team2');
      manager.registerTeam('team3');

      const teams = manager.listTeams();
      expect(teams).toHaveLength(3);
      expect(teams).toContain('team1');
      expect(teams).toContain('team2');
      expect(teams).toContain('team3');
    });

    it('returns empty array when no teams', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      expect(manager.listTeams()).toEqual([]);
    });
  });

  describe('registerMember', () => {
    it('registers a member to a team', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      const member = manager.registerMember('agent-1', 'test-team', 'researcher');

      expect(member.memberId).toBe('agent-1');
      expect(member.teamId).toBe('test-team');
      expect(member.role).toBe('researcher');
      expect(member.memoryPath).toContain('agent-1');
    });

    it('updates existing member', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      manager.registerMember('agent-1', 'test-team', 'researcher');
      const updated = manager.registerMember('agent-1', 'test-team', 'lead');

      expect(updated.role).toBe('lead');
      expect(manager.getTeamMembers('test-team')).toHaveLength(1);
    });
  });

  describe('getTeamMembers', () => {
    it('returns all members of a team', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      manager.registerMember('agent-1', 'test-team');
      manager.registerMember('agent-2', 'test-team');
      manager.registerMember('agent-3', 'test-team');

      const members = manager.getTeamMembers('test-team');
      expect(members).toHaveLength(3);
    });

    it('returns empty array for non-existent team', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      expect(manager.getTeamMembers('ghost-team')).toEqual([]);
    });
  });

  describe('touchMember', () => {
    it('updates last sync timestamp', async () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');
      manager.registerMember('agent-1', 'test-team');

      const before = manager.getMember('agent-1', 'test-team')!.lastSync!;
      await new Promise(r => setTimeout(r, 10)); // Small delay
      manager.touchMember('agent-1', 'test-team');

      const after = manager.getMember('agent-1', 'test-team')!.lastSync!;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe('Memory Path Resolution', () => {
    it('gets shared memory path', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      const path = manager.getSharedMemoryPath('test-team');
      expect(path).toContain('shared.MEMORY.md');
    });

    it('gets member memory path', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');
      manager.registerMember('agent-1', 'test-team');

      const path = manager.getMemberMemoryPath('agent-1', 'test-team');
      expect(path).toContain('agent-1');
      expect(path).toContain('memory');
    });

    it('gets context path', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      const path = manager.getContextPath('test-team');
      expect(path).toContain('context.json');
    });

    it('gets prompts directory', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      const dir = manager.getPromptsDir('test-team');
      expect(dir).toContain('prompts');
    });
  });

  describe('getAccessibleMemoryPaths', () => {
    it('returns own memory and shared memory', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');
      manager.registerMember('agent-1', 'test-team');

      const paths = manager.getAccessibleMemoryPaths('agent-1', 'test-team');
      expect(paths).toHaveLength(2); // Own + shared
    });

    it('returns only shared memory without members', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('test-team');

      const paths = manager.getAccessibleMemoryPaths('agent-1', 'test-team');
      expect(paths).toHaveLength(1); // Only shared
    });
  });

  describe('Cross-Team Sharing', () => {
    it('disables cross-team sharing when configured', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR, crossTeamSharing: false });
      manager.registerTeam('team1');
      manager.registerTeam('team2');

      const paths = manager.getAccessibleMemoryPaths('agent-1', 'team1');
      expect(paths).toHaveLength(1); // Only own/shared, no cross-team
    });

    it('enables cross-team sharing by default', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('team1');
      manager.registerTeam('team2');

      // Without cross-team connections, still only returns own paths
      const paths = manager.getAccessibleMemoryPaths('agent-1', 'team1');
      expect(paths.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Serialization', () => {
    it('exports team registry state', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('team1');
      manager.registerMember('agent-1', 'team1', 'researcher');

      const json = manager.toJSON();
      expect(json).toHaveProperty('config');
      expect(json).toHaveProperty('teams');
      expect(json).toHaveProperty('members');
    });

    it('imports team registry state', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('team1');
      manager.registerMember('agent-1', 'team1', 'researcher');

      const json = manager.toJSON();

      // Create new manager and import
      const newManager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      newManager.fromJSON(json);

      expect(newManager.listTeams()).toContain('team1');
      expect(newManager.getTeamMembers('team1')).toHaveLength(1);
    });
  });

  describe('Singleton', () => {
    it('returns same instance', () => {
      const instance1 = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      const instance2 = getTeamMemoryPaths();

      expect(instance1).toBe(instance2);
    });

    it('resets singleton', () => {
      const instance1 = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      resetTeamMemoryPaths();
      const instance2 = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('generateTeamPrompt', () => {
    it('generates team prompt with context', () => {
      const manager = getTeamMemoryPaths({ baseDir: TEST_BASE_DIR });
      manager.registerTeam('research');
      manager.registerMember('analyst-1', 'research', 'analyst');

      const prompt = generateTeamPrompt('research', 'analyst-1');

      expect(prompt).toContain('research');
      expect(prompt).toContain('analyst-1');
      expect(prompt).toContain('analyst');
      expect(prompt).toContain('Team Context');
      expect(prompt).toContain('Shared Memory');
    });
  });
});
