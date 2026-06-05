/**
 * Task System
 *
 * A minimal but complete task management system for agent workflows.
 *
 * Features:
 * - Task creation, update, and completion
 * - Task states: pending, running, completed, failed, cancelled
 * - Task priority levels
 * - Task dependencies (waiting for other tasks)
 * - Task persistence across sessions
 * - Task queue for sequential execution
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Task priority
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Task data
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  /** Parent task ID (for sub-tasks) */
  parentId?: string;
  /** Tasks that must complete before this one */
  dependsOn?: string[];
  /** Result or output of the task */
  result?: string;
  /** Error message if failed */
  error?: string;
  /** Metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * Task creation options
 */
export interface CreateTaskOptions {
  title: string;
  description?: string;
  priority?: TaskPriority;
  parentId?: string;
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Task update options
 */
export interface UpdateTaskOptions {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  result?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Task Manager
// ============================================================================

/**
 * Task Manager for creating, updating, and tracking tasks.
 *
 * Provides a simple API for task management with persistence support.
 */
export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private listeners: Set<(event: TaskEvent) => void> = new Set();

  constructor(initialTasks?: Task[]) {
    if (initialTasks) {
      for (const task of initialTasks) {
        this.tasks.set(task.id, task);
      }
    }
  }

  /**
   * Create a new task
   */
  create(options: CreateTaskOptions): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: this.createTaskId(),
      title: options.title,
      description: options.description ?? '',
      status: 'pending',
      priority: options.priority ?? 'normal',
      createdAt: now,
      updatedAt: now,
      parentId: options.parentId,
      dependsOn: options.dependsOn,
      metadata: options.metadata,
    };

    this.tasks.set(task.id, task);
    this.emit({ type: 'created', task });
    return task;
  }

  /**
   * Update an existing task
   */
  update(taskId: string, options: UpdateTaskOptions): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updated: Task = {
      ...task,
      title: options.title ?? task.title,
      description: options.description ?? task.description,
      status: options.status ?? task.status,
      priority: options.priority ?? task.priority,
      result: options.result ?? task.result,
      error: options.error ?? task.error,
      metadata: { ...task.metadata, ...options.metadata },
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, updated);
    this.emit({ type: 'updated', task: updated, previousTask: task });
    return updated;
  }

  /**
   * Mark task as running
   */
  start(taskId: string): Task | null {
    return this.update(taskId, { status: 'running' });
  }

  /**
   * Mark task as completed with result
   */
  complete(taskId: string, result: string): Task | null {
    return this.update(taskId, { status: 'completed', result });
  }

  /**
   * Mark task as failed with error message
   */
  fail(taskId: string, error: string): Task | null {
    return this.update(taskId, { status: 'failed', error });
  }

  /**
   * Cancel a task
   */
  cancel(taskId: string): Task | null {
    return this.update(taskId, { status: 'cancelled' });
  }

  /**
   * Get a task by ID
   */
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getByStatus(status: TaskStatus): Task[] {
    return this.getAll().filter(t => t.status === status);
  }

  /**
   * Get tasks by priority
   */
  getByPriority(priority: TaskPriority): Task[] {
    return this.getAll().filter(t => t.priority === priority);
  }

  /**
   * Get pending tasks that are ready to execute (dependencies met)
   */
  getReadyTasks(): Task[] {
    return this.getByStatus('pending').filter(task => {
      if (!task.dependsOn?.length) return true;
      return task.dependsOn.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status === 'completed' || dep?.status === 'cancelled';
      });
    });
  }

  /**
   * Get next task to execute (highest priority, ready to run)
   */
  getNextTask(): Task | undefined {
    const ready = this.getReadyTasks();
    if (ready.length === 0) return undefined;

    // Sort by priority (critical > high > normal > low)
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    return ready.sort((a, b) => {
      const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priDiff !== 0) return priDiff;
      // Same priority: earlier created first (FIFO within priority)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })[0];
  }

  /**
   * Delete a task
   */
  delete(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.tasks.delete(taskId);
    this.emit({ type: 'deleted', task });
    return true;
  }

  /**
   * Create a sub-task under a parent
   */
  createSubTask(parentId: string, options: CreateTaskOptions): Task | null {
    const parent = this.tasks.get(parentId);
    if (!parent) return null;

    return this.create({
      ...options,
      parentId,
    });
  }

  /**
   * Get sub-tasks of a task
   */
  getSubTasks(parentId: string): Task[] {
    return this.getAll().filter(t => t.parentId === parentId);
  }

  /**
   * Get progress of a task (completed sub-tasks / total sub-tasks)
   */
  getProgress(parentId: string): { completed: number; total: number } {
    const subTasks = this.getSubTasks(parentId);
    return {
      completed: subTasks.filter(t => t.status === 'completed').length,
      total: subTasks.length,
    };
  }

  /**
   * Add event listener
   */
  onEvent(listener: (event: TaskEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Create unique task ID
   */
  private createTaskId(): string {
    const hash = createHash('sha256')
      .update(new Date().toISOString() + Math.random())
      .digest('hex')
      .slice(0, 12);
    return `task_${hash}`;
  }

  /**
   * Export all tasks as JSON
   */
  export(): string {
    return JSON.stringify(this.getAll(), null, 2);
  }

  /**
   * Import tasks from JSON
   */
  import(json: string): number {
    try {
      const tasks = JSON.parse(json) as Task[];
      let count = 0;
      for (const task of tasks) {
        if (task.id && task.title) {
          this.tasks.set(task.id, task);
          count++;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }
}

// ============================================================================
// Task Events
// ============================================================================

export type TaskEventType = 'created' | 'updated' | 'deleted';

export interface TaskEvent {
  type: TaskEventType;
  task: Task;
  previousTask?: Task;
}

// ============================================================================
// Task Queue (for sequential task execution)
// ============================================================================

/**
 * Simple task queue for sequential execution
 */
export class TaskQueue {
  private queue: Task[] = [];
  private manager: TaskManager;

  constructor(manager: TaskManager) {
    this.manager = manager;
  }

  /**
   * Add tasks to the queue
   */
  enqueue(...tasks: Task[]): void {
    this.queue.push(...tasks);
  }

  /**
   * Get next task from queue
   */
  dequeue(): Task | undefined {
    return this.queue.shift();
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue length
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
  }
}

// ============================================================================
// Module-level Singleton
// ============================================================================

let _taskManager: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!_taskManager) {
    _taskManager = new TaskManager();
  }
  return _taskManager;
}

export function resetTaskManager(): void {
  _taskManager = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a task with automatic manager singleton
 */
export function createTask(options: CreateTaskOptions): Task {
  return getTaskManager().create(options);
}

/**
 * Complete a task by ID
 */
export function completeTask(taskId: string, result: string): Task | null {
  return getTaskManager().complete(taskId, result);
}

/**
 * Fail a task by ID
 */
export function failTask(taskId: string, error: string): Task | null {
  return getTaskManager().fail(taskId, error);
}

/**
 * Get task by ID
 */
export function getTask(taskId: string): Task | undefined {
  return getTaskManager().get(taskId);
}