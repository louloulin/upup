/**
 * In-memory TaskList for tests and ephemeral runs.
 *
 * Implements the same TaskList contract as FileTaskList but holds state in
 * memory only. Useful for unit tests of the coordinator and for transient
 * runs where the user does not want anything persisted to disk.
 */

import type { Phase, Task, TaskList, TaskStatus, WorkerRole } from './types.js';

export class InMemoryTaskList implements TaskList {
  readonly path = '<in-memory>';
  private readonly tasks: Task[] = [];
  private nextId = 1;
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  async create(
    task: Omit<Task, 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskStatus },
  ): Promise<Task> {
    const ts = this.now();
    const id = task.id ?? `task-${this.nextId++}`;
    const created: Task = {
      ...task,
      id,
      status: task.status ?? 'pending',
      createdAt: ts,
      updatedAt: ts,
    };
    this.tasks.push(created);
    return created;
  }

  async update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Task ${id} not found`);
    const updated: Task = {
      ...this.tasks[idx]!,
      ...patch,
      updatedAt: this.now(),
    };
    this.tasks[idx] = updated;
    return updated;
  }

  async get(id: string): Promise<Task | null> {
    return this.tasks.find((t) => t.id === id) ?? null;
  }

  async list(filter?: { phase?: Phase; assignee?: WorkerRole | 'coordinator'; status?: TaskStatus }): Promise<Task[]> {
    if (!filter) return [...this.tasks];
    return this.tasks.filter((t) => {
      if (filter.phase && t.phase !== filter.phase) return false;
      if (filter.assignee && t.assignee !== filter.assignee) return false;
      if (filter.status && t.status !== filter.status) return false;
      return true;
    });
  }
}

export function createInMemoryTaskList(opts?: { now?: () => number }): TaskList {
  return new InMemoryTaskList(opts);
}
