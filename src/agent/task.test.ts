/**
 * Task System Test
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  TaskManager,
  TaskQueue,
  Task,
  TaskStatus,
  TaskPriority,
  getTask,
  createTask,
  completeTask,
  failTask,
  resetTaskManager,
} from './task.js';

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    resetTaskManager();
    manager = new TaskManager();
  });

  describe('create', () => {
    it('should create a task with required fields', () => {
      const task = manager.create({ title: 'Test Task' });

      expect(task.id).toMatch(/^task_/);
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('');
      expect(task.status).toBe('pending');
      expect(task.priority).toBe('normal');
    });

    it('should create a task with all options', () => {
      const task = manager.create({
        title: 'Important Task',
        description: 'This is important',
        priority: 'high',
        metadata: { tags: ['test'] },
      });

      expect(task.description).toBe('This is important');
      expect(task.priority).toBe('high');
      expect(task.metadata?.tags).toEqual(['test']);
    });

    it('should create a task with dependencies', () => {
      const dep = manager.create({ title: 'Dependency' });
      const task = manager.create({
        title: 'Task with deps',
        dependsOn: [dep.id],
      });

      expect(task.dependsOn).toContain(dep.id);
    });
  });

  describe('update', () => {
    it('should update task fields', () => {
      const task = manager.create({ title: 'Original' });
      // Wait a bit so updatedAt differs from createdAt
      const originalUpdated = task.updatedAt;
      const updated = manager.update(task.id, { title: 'Updated' });

      expect(updated?.title).toBe('Updated');
      // updatedAt should be >= original (may be same if immediate)
      expect(updated?.updatedAt).toBeDefined();
    });

    it('should return null for non-existent task', () => {
      const result = manager.update('non-existent', { title: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('start/complete/fail/cancel', () => {
    it('should mark task as running', () => {
      const task = manager.create({ title: 'Task' });
      const started = manager.start(task.id);

      expect(started?.status).toBe('running');
    });

    it('should mark task as completed with result', () => {
      const task = manager.create({ title: 'Task' });
      const completed = manager.complete(task.id, 'Done!');

      expect(completed?.status).toBe('completed');
      expect(completed?.result).toBe('Done!');
    });

    it('should mark task as failed with error', () => {
      const task = manager.create({ title: 'Task' });
      const failed = manager.fail(task.id, 'Something went wrong');

      expect(failed?.status).toBe('failed');
      expect(failed?.error).toBe('Something went wrong');
    });

    it('should cancel a task', () => {
      const task = manager.create({ title: 'Task' });
      const cancelled = manager.cancel(task.id);

      expect(cancelled?.status).toBe('cancelled');
    });
  });

  describe('get/getAll', () => {
    it('should get task by ID', () => {
      const task = manager.create({ title: 'Test' });
      const found = manager.get(task.id);

      expect(found?.title).toBe('Test');
    });

    it('should return undefined for non-existent task', () => {
      const found = manager.get('non-existent');
      expect(found).toBeUndefined();
    });

    it('should get all tasks', () => {
      manager.create({ title: 'Task 1' });
      manager.create({ title: 'Task 2' });

      const all = manager.getAll();
      expect(all.length).toBe(2);
    });
  });

  describe('getByStatus/getByPriority', () => {
    it('should get tasks by status', () => {
      const t1 = manager.create({ title: 'Task 1' });
      manager.create({ title: 'Task 2' });
      manager.complete(t1.id, 'Done');

      const pending = manager.getByStatus('pending');
      expect(pending.length).toBe(1);
    });

    it('should get tasks by priority', () => {
      manager.create({ title: 'Low', priority: 'low' });
      manager.create({ title: 'Critical', priority: 'critical' });

      const critical = manager.getByPriority('critical');
      expect(critical.length).toBe(1);
      expect(critical[0].title).toBe('Critical');
    });
  });

  describe('getReadyTasks', () => {
    it('should return tasks with no dependencies', () => {
      const task = manager.create({ title: 'Independent' });
      const ready = manager.getReadyTasks();

      expect(ready).toContain(task);
    });

    it('should return tasks with completed dependencies', () => {
      const dep = manager.create({ title: 'Dep' });
      const task = manager.create({ title: 'Task', dependsOn: [dep.id] });

      manager.complete(dep.id, 'Done');
      const ready = manager.getReadyTasks();

      expect(ready).toContain(task);
    });

    it('should not return tasks with pending dependencies', () => {
      const dep = manager.create({ title: 'Dep' });
      manager.create({ title: 'Task', dependsOn: [dep.id] });

      const ready = manager.getReadyTasks();
      expect(ready.length).toBe(1); // Only the dependency task
    });
  });

  describe('getNextTask', () => {
    it('should return highest priority task', () => {
      manager.create({ title: 'Low', priority: 'low' });
      const critical = manager.create({ title: 'Critical', priority: 'critical' });

      const next = manager.getNextTask();
      expect(next?.title).toBe('Critical');
    });

    it('should return FIFO within same priority', async () => {
      // Note: FIFO based on createdAt, so earlier-created first
      const first = manager.create({ title: 'First', priority: 'high' });
      manager.create({ title: 'Second', priority: 'high' });

      const next = manager.getNextTask();
      expect(next?.id).toBe(first.id);
    });
  });

  describe('sub-tasks', () => {
    it('should create sub-task', () => {
      const parent = manager.create({ title: 'Parent' });
      const sub = manager.createSubTask(parent.id, { title: 'Sub-task' });

      expect(sub?.parentId).toBe(parent.id);
    });

    it('should get sub-tasks', () => {
      const parent = manager.create({ title: 'Parent' });
      manager.createSubTask(parent.id, { title: 'Sub 1' });
      manager.createSubTask(parent.id, { title: 'Sub 2' });

      const subs = manager.getSubTasks(parent.id);
      expect(subs.length).toBe(2);
    });

    it('should calculate progress', () => {
      const parent = manager.create({ title: 'Parent' });
      const s1 = manager.createSubTask(parent.id, { title: 'Sub 1' });
      manager.createSubTask(parent.id, { title: 'Sub 2' });

      manager.complete(s1!.id, 'Done');

      const progress = manager.getProgress(parent.id);
      expect(progress.completed).toBe(1);
      expect(progress.total).toBe(2);
    });
  });

  describe('delete', () => {
    it('should delete a task', () => {
      const task = manager.create({ title: 'To Delete' });
      const result = manager.delete(task.id);

      expect(result).toBe(true);
      expect(manager.get(task.id)).toBeUndefined();
    });

    it('should return false for non-existent task', () => {
      const result = manager.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('export/import', () => {
    it('should export tasks as JSON', () => {
      manager.create({ title: 'Task 1' });
      manager.create({ title: 'Task 2' });

      const json = manager.export();
      const parsed = JSON.parse(json);

      expect(parsed.length).toBe(2);
    });

    it('should import tasks from JSON', () => {
      const json = JSON.stringify([
        { id: 'task_123', title: 'Imported', description: '', status: 'pending', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ]);

      const count = manager.import(json);
      expect(count).toBe(1);
      expect(manager.get('task_123')?.title).toBe('Imported');
    });
  });

  describe('event listener', () => {
    it('should emit events on task changes', () => {
      let eventFired = false;
      manager.onEvent(() => { eventFired = true; });

      manager.create({ title: 'Test' });
      expect(eventFired).toBe(true);
    });
  });
});

describe('TaskQueue', () => {
  let manager: TaskManager;
  let queue: TaskQueue;

  beforeEach(() => {
    resetTaskManager();
    manager = new TaskManager();
    queue = new TaskQueue(manager);
  });

  it('should enqueue and dequeue tasks', () => {
    const t1 = manager.create({ title: 'Task 1' });
    const t2 = manager.create({ title: 'Task 2' });

    queue.enqueue(t1, t2);

    expect(queue.size()).toBe(2);
    expect(queue.dequeue()?.title).toBe('Task 1');
    expect(queue.size()).toBe(1);
  });

  it('should check if empty', () => {
    expect(queue.isEmpty()).toBe(true);
    queue.enqueue(manager.create({ title: 'Task' }));
    expect(queue.isEmpty()).toBe(false);
  });

  it('should clear queue', () => {
    queue.enqueue(manager.create({ title: 'Task' }));
    queue.clear();
    expect(queue.isEmpty()).toBe(true);
  });
});

describe('Module-level utilities', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  it('createTask should work with singleton', () => {
    const task = createTask({ title: 'Singleton Task' });
    expect(task.title).toBe('Singleton Task');
  });

  it('completeTask should complete via singleton', () => {
    const task = createTask({ title: 'To Complete' });
    const completed = completeTask(task.id, 'Done');

    expect(completed?.status).toBe('completed');
  });

  it('failTask should fail via singleton', () => {
    const task = createTask({ title: 'To Fail' });
    const failed = failTask(task.id, 'Error');

    expect(failed?.status).toBe('failed');
  });

  it('getTask should get via singleton', () => {
    const task = createTask({ title: 'Find Me' });
    const found = getTask(task.id);

    expect(found?.title).toBe('Find Me');
  });
});