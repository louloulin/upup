/**
 * Unit tests for Team Coordination
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  TeamCoordinator,
  getTeamCoordinator,
  resetTeamCoordinator,
  type TeamMember,
  type TeamTask,
  type TeamMessage,
} from './team-coordination.js';

describe('TeamCoordinator', () => {
  let coordinator: TeamCoordinator;

  beforeEach(() => {
    resetTeamCoordinator();
    coordinator = new TeamCoordinator({
      name: 'Test Team',
      maxSize: 5,
      distributionStrategy: 'capability_based',
    });
  });

  describe('Member management', () => {
    test('addMember adds member successfully', () => {
      const member: TeamMember = {
        id: 'member1',
        name: 'Alice',
        role: 'worker',
        capabilities: ['coding', 'testing'],
        status: 'idle',
        activeTasks: [],
        completedTasks: [],
      };

      const result = coordinator.addMember(member);

      expect(result).toBe(true);
      expect(coordinator.getMember('member1')).toBeDefined();
      expect(coordinator.getMember('member1')?.name).toBe('Alice');
    });

    test('addMember respects max size', () => {
      const smallTeam = new TeamCoordinator({ maxSize: 2 });

      smallTeam.addMember({
        id: 'm1', name: 'M1', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });
      smallTeam.addMember({
        id: 'm2', name: 'M2', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });
      const result = smallTeam.addMember({
        id: 'm3', name: 'M3', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });

      expect(result).toBe(false);
    });

    test('removeMember removes and cleans up', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const result = coordinator.removeMember('member1');

      expect(result).toBe(true);
      expect(coordinator.getMember('member1')).toBeUndefined();
    });

    test('getAvailableMembers returns idle members', () => {
      coordinator.addMember({
        id: 'm1', name: 'Alice', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });
      coordinator.addMember({
        id: 'm2', name: 'Bob', role: 'worker', capabilities: [], status: 'busy', activeTasks: ['t1'], completedTasks: [],
      });

      const available = coordinator.getAvailableMembers();

      expect(available).toHaveLength(1);
      expect(available[0].name).toBe('Alice');
    });

    test('updateMemberStatus changes status', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });

      coordinator.updateMemberStatus('member1', 'busy');

      expect(coordinator.getMember('member1')?.status).toBe('busy');
    });
  });

  describe('Task management', () => {
    test('createTask creates task with ID', () => {
      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      expect(task.id).toMatch(/^task-/);
      expect(task.status).toBe('pending');
      expect(task.createdAt).toBeGreaterThan(0);
    });

    test('assignTask assigns to capable member', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      const result = coordinator.assignTask(task.id, 'member1');

      expect(result).toBe(true);
      expect(coordinator.getTask(task.id)?.assignedTo).toBe('member1');
      expect(coordinator.getTask(task.id)?.status).toBe('assigned');
    });

    test('assignTask fails without required capabilities', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['design'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      const result = coordinator.assignTask(task.id, 'member1');

      expect(result).toBe(false);
    });

    test('startTask transitions to in_progress', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      coordinator.assignTask(task.id, 'member1');
      coordinator.startTask(task.id);

      expect(coordinator.getTask(task.id)?.status).toBe('in_progress');
    });

    test('completeTask updates task and member', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      coordinator.assignTask(task.id, 'member1');
      coordinator.startTask(task.id);
      coordinator.completeTask(task.id);

      expect(coordinator.getTask(task.id)?.status).toBe('completed');
      expect(coordinator.getTask(task.id)?.completedAt).toBeDefined();
      expect(coordinator.getMember('member1')?.completedTasks).toContain(task.id);
    });

    test('failTask marks task as failed', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      coordinator.assignTask(task.id, 'member1');
      coordinator.startTask(task.id);
      coordinator.failTask(task.id, 'Implementation error');

      expect(coordinator.getTask(task.id)?.status).toBe('failed');
    });

    test('unassignTask returns task to pending', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task = coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      coordinator.assignTask(task.id, 'member1');
      coordinator.unassignTask(task.id);

      expect(coordinator.getTask(task.id)?.status).toBe('pending');
      expect(coordinator.getTask(task.id)?.assignedTo).toBeUndefined();
    });
  });

  describe('Task distribution', () => {
    test('distributeTasks assigns to capable members', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding', 'testing'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      coordinator.createTask({
        description: 'Build feature X',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      coordinator.distributeTasks();

      const tasks = coordinator.getTasksByStatus('assigned');
      expect(tasks).toHaveLength(1);
    });

    test('respects dependency order', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: ['coding'], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task1 = coordinator.createTask({
        description: 'Task 1',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [],
      });

      const task2 = coordinator.createTask({
        description: 'Task 2',
        requiredCapabilities: ['coding'],
        priority: 5,
        dependencies: [task1.id],
      });

      coordinator.distributeTasks();

      // Task 2 should not be assigned until Task 1 is complete
      expect(coordinator.getTask(task2.id)?.status).toBe('pending');
    });
  });

  describe('Messaging', () => {
    test('sendMessage creates message with ID', () => {
      const message = coordinator.sendMessage({
        from: 'coordinator',
        to: 'member1',
        type: 'task',
        content: 'New task assigned',
      });

      expect(message.id).toMatch(/^msg-/);
      expect(message.timestamp).toBeGreaterThan(0);
    });

    test('getMessages filters correctly', () => {
      coordinator.addMember({
        id: 'member1', name: 'Alice', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });

      coordinator.sendMessage({
        from: 'coordinator',
        to: 'member1',
        type: 'task',
        content: 'Message 1',
      });
      coordinator.sendMessage({
        from: 'member1',
        to: 'coordinator',
        type: 'response',
        content: 'Message 2',
      });

      const toMember = coordinator.getMessages({ to: 'member1' });
      expect(toMember).toHaveLength(1);
    });
  });

  describe('Team status', () => {
    test('getTeamStatus returns correct counts', () => {
      coordinator.addMember({
        id: 'm1', name: 'Alice', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });
      coordinator.addMember({
        id: 'm2', name: 'Bob', role: 'worker', capabilities: [], status: 'idle', activeTasks: [], completedTasks: [],
      });

      const task1 = coordinator.createTask({
        description: 'Task 1', requiredCapabilities: [], priority: 5, dependencies: [],
      });
      coordinator.createTask({
        description: 'Task 2', requiredCapabilities: [], priority: 5, dependencies: [],
      });

      coordinator.assignTask(task1.id, 'm1');
      coordinator.startTask(task1.id);
      coordinator.completeTask(task1.id);

      const status = coordinator.getTeamStatus();

      expect(status.name).toBe('Test Team');
      expect(status.memberCount).toBe(2);
      expect(status.taskCount).toBe(2);
      expect(status.completedCount).toBe(1);
      expect(status.pendingCount).toBe(1);
    });
  });
});

describe('Singleton functions', () => {
  test('getTeamCoordinator returns same instance', () => {
    resetTeamCoordinator();
    const coord1 = getTeamCoordinator();
    const coord2 = getTeamCoordinator();

    expect(coord1).toBe(coord2);
  });

  test('resetTeamCoordinator clears instance', () => {
    const coord1 = getTeamCoordinator();
    resetTeamCoordinator();
    const coord2 = getTeamCoordinator();

    expect(coord1).not.toBe(coord2);
  });
});

describe('TeamMember structure', () => {
  test('member has correct structure', () => {
    const member: TeamMember = {
      id: 'm1',
      name: 'Alice',
      role: 'coordinator',
      capabilities: ['coding', 'review'],
      status: 'idle',
      activeTasks: [],
      completedTasks: [],
    };

    expect(member.id).toBe('m1');
    expect(member.role).toBe('coordinator');
    expect(member.capabilities).toContain('coding');
  });
});

describe('TeamTask structure', () => {
  test('task has correct structure', () => {
    const task: TeamTask = {
      id: 't1',
      description: 'Build feature',
      requiredCapabilities: ['coding'],
      status: 'pending',
      priority: 8,
      dependencies: [],
      createdAt: Date.now(),
    };

    expect(task.id).toBe('t1');
    expect(task.priority).toBe(8);
    expect(task.dependencies).toHaveLength(0);
  });
});
