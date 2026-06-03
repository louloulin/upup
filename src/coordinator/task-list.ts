/**
 * File-based shared task list for Coordinator/Worker coordination.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 *      (Requirement: Shared Task List)
 *
 * Tasks are persisted as a single JSON file at `<root>/tasks.json` so the
 * Coordinator and any spawned Workers can read/write shared state across
 * process boundaries. The on-disk format is intentionally simple (an array)
 * — locking / atomicity is handled by serializing reads and writes through
 * a single in-process promise chain. Cross-process locking is out of scope.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Phase, Task, TaskList, TaskStatus, WorkerRole } from './types.js';

const DEFAULT_ROOT = join(homedir(), '.upup', 'coordinator', 'tasks');

export interface FileTaskListOptions {
  /** Override the directory holding tasks.json. */
  rootDir?: string;
  /** Optional clock for tests. */
  now?: () => number;
}

export class FileTaskList implements TaskList {
  readonly path: string;
  private readonly now: () => number;
  /** Serializes file I/O so concurrent create/update calls don't clobber each other. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(opts: FileTaskListOptions = {}) {
    this.path = join(opts.rootDir ?? DEFAULT_ROOT, 'tasks.json');
    this.now = opts.now ?? (() => Date.now());
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next as Promise<T>;
  }

  private async load(): Promise<Task[]> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Task[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  private async save(tasks: Task[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(tasks, null, 2), 'utf8');
    await rename(tmp, this.path);
  }

  async create(
    task: Omit<Task, 'createdAt' | 'updatedAt' | 'status'> & { status?: TaskStatus },
  ): Promise<Task> {
    return this.withLock(async () => {
      const tasks = await this.load();
      const ts = this.now();
      const created: Task = {
        ...task,
        status: task.status ?? 'pending',
        createdAt: ts,
        updatedAt: ts,
      };
      tasks.push(created);
      await this.save(tasks);
      return created;
    });
  }

  async update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
    return this.withLock(async () => {
      const tasks = await this.load();
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error(`Task ${id} not found`);
      const updated: Task = {
        ...tasks[idx]!,
        ...patch,
        updatedAt: this.now(),
      };
      tasks[idx] = updated;
      await this.save(tasks);
      return updated;
    });
  }

  async get(id: string): Promise<Task | null> {
    return this.withLock(async () => {
      const tasks = await this.load();
      return tasks.find((t) => t.id === id) ?? null;
    });
  }

  async list(filter?: { phase?: Phase; assignee?: WorkerRole | 'coordinator'; status?: TaskStatus }): Promise<Task[]> {
    return this.withLock(async () => {
      const tasks = await this.load();
      if (!filter) return tasks;
      return tasks.filter((t) => {
        if (filter.phase && t.phase !== filter.phase) return false;
        if (filter.assignee && t.assignee !== filter.assignee) return false;
        if (filter.status && t.status !== filter.status) return false;
        return true;
      });
    });
  }
}

export function createFileTaskList(opts?: FileTaskListOptions): TaskList {
  return new FileTaskList(opts);
}
