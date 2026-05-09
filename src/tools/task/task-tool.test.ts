/**
 * Task System Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createTaskCreateTool,
  createTaskGetTool,
  createTaskListTool,
  createTaskStopTool,
  createTaskUpdateTool,
  taskStore,
  type Task,
} from './task-tool.js';

describe('Task System', () => {
  beforeEach(() => {
    // Clear the store before each test
    for (const task of taskStore.listTasks()) {
      taskStore.deleteTask(task.id);
    }
  });

  describe('createTaskCreateTool', () => {
    it('should create a task with correct structure', async () => {
      const tool = createTaskCreateTool();
      const result = await tool.invoke({
        name: 'test-task',
        description: 'Test task description',
      });

      expect(result).toContain('Task created');
      expect(result).toContain('test-task');
      expect(result).toContain('Test task description');
      expect(result).toContain('pending');
    });

    it('should include metadata when provided', async () => {
      const tool = createTaskCreateTool();
      const result = await tool.invoke({
        name: 'task-with-metadata',
        metadata: { priority: 'high', category: 'research' },
      });

      expect(result).toContain('task-with-metadata');
    });
  });

  describe('createTaskGetTool', () => {
    it('should get task by id', async () => {
      // Create a task first
      const createTool = createTaskCreateTool();
      const createResult = await createTool.invoke({ name: 'get-test-task' });

      // Extract the task ID
      const idMatch = createResult.match(/\*\*ID:\*\* ([a-f0-9-]+)/);
      expect(idMatch).toBeTruthy();

      // Get the task
      const getTool = createTaskGetTool();
      const getResult = await getTool.invoke({ task_id: idMatch![1] });

      expect(getResult).toContain('get-test-task');
      expect(getResult).toContain('pending');
    });

    it('should return error for non-existent task', async () => {
      const tool = createTaskGetTool();
      const result = await tool.invoke({ task_id: 'non-existent-id' });

      expect(result).toContain('not found');
    });
  });

  describe('createTaskListTool', () => {
    it('should list all tasks', async () => {
      // Create some tasks
      const createTool = createTaskCreateTool();
      await createTool.invoke({ name: 'task-1' });
      await createTool.invoke({ name: 'task-2' });

      const listTool = createTaskListTool();
      const result = await listTool.invoke({});

      expect(result).toContain('task-1');
      expect(result).toContain('task-2');
      expect(result).toContain('2 pending');
    });

    it('should filter by status', async () => {
      // Create tasks
      const createTool = createTaskCreateTool();
      const task1 = await createTool.invoke({ name: 'pending-task' });
      const task2 = await createTool.invoke({ name: 'running-task' });

      // Get task IDs
      const idMatch1 = task1.match(/\*\*ID:\*\* ([a-f0-9-]+)/);
      const idMatch2 = task2.match(/\*\*ID:\*\* ([a-f0-9-]+)/);

      // Start one task
      if (idMatch2) {
        taskStore.startTask(idMatch2![1]);
      }

      // List pending tasks
      const listTool = createTaskListTool();
      const pendingResult = await listTool.invoke({ status: 'pending' });
      expect(pendingResult).toContain('pending-task');
      expect(pendingResult).not.toContain('running-task');

      // List running tasks
      const runningResult = await listTool.invoke({ status: 'running' });
      expect(runningResult).toContain('running-task');
      expect(runningResult).not.toContain('pending-task');
    });

    it('should show empty list when no tasks', async () => {
      const tool = createTaskListTool();
      const result = await tool.invoke({});

      expect(result).toContain('No tasks');
    });
  });

  describe('createTaskStopTool', () => {
    it('should stop a task', async () => {
      // Create a task
      const createTool = createTaskCreateTool();
      const createResult = await createTool.invoke({ name: 'stoppable-task' });

      // Get task ID
      const idMatch = createResult.match(/\*\*ID:\*\* ([a-f0-9-]+)/);
      expect(idMatch).toBeTruthy();

      // Stop the task
      const stopTool = createTaskStopTool();
      const stopResult = await stopTool.invoke({
        task_id: idMatch![1],
        reason: 'Test stop reason',
      });

      expect(stopResult).toContain('Task stopped');
      expect(stopResult).toContain('stoppable-task');
      expect(stopResult).toContain('cancelled');
    });

    it('should return error for non-existent task', async () => {
      const tool = createTaskStopTool();
      const result = await tool.invoke({ task_id: 'non-existent-id' });

      expect(result).toContain('not found');
    });
  });

  describe('createTaskUpdateTool', () => {
    it('should update task progress', async () => {
      // Create a task
      const createTool = createTaskCreateTool();
      const createResult = await createTool.invoke({ name: 'updatable-task' });

      // Get task ID
      const idMatch = createResult.match(/\*\*ID:\*\* ([a-f0-9-]+)/);
      expect(idMatch).toBeTruthy();

      // Update the task
      const updateTool = createTaskUpdateTool();
      const updateResult = await updateTool.invoke({
        task_id: idMatch![1],
        progress: 50,
        result: 'Processing items...',
      });

      expect(updateResult).toContain('Task updated');
      expect(updateResult).toContain('50');
      expect(updateResult).toContain('Processing items');
    });

    it('should return error for non-existent task', async () => {
      const tool = createTaskUpdateTool();
      const result = await tool.invoke({ task_id: 'non-existent-id' });

      expect(result).toContain('not found');
    });
  });

  describe('TaskStore', () => {
    it('should track task statistics', () => {
      taskStore.createTask('Task 1');
      taskStore.createTask('Task 2');
      taskStore.createTask('Task 3');

      const stats = taskStore.getTaskStats();
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(3);
    });

    it('should delete tasks', () => {
      const task = taskStore.createTask('To be deleted');
      expect(taskStore.getTask(task.id)).toBeTruthy();

      taskStore.deleteTask(task.id);
      expect(taskStore.getTask(task.id)).toBeUndefined();
    });

    it('should start and complete tasks', () => {
      const task = taskStore.createTask('Process task');
      expect(taskStore.startTask(task.id)).toBe(true);

      const startedTask = taskStore.getTask(task.id);
      expect(startedTask?.status).toBe('running');
      expect(startedTask?.startedAt).toBeTruthy();

      expect(taskStore.completeTask(task.id, 'Output result')).toBe(true);

      const completedTask = taskStore.getTask(task.id);
      expect(completedTask?.status).toBe('completed');
      expect(completedTask?.result).toBe('Output result');
      expect(completedTask?.completedAt).toBeTruthy();
    });
  });
});
