/**
 * Generic stop helper for tasks.
 *
 * Cancels one or more tasks with a shared reason. Safe to call on
 * already-cancelled or terminal tasks (no-op). Returns a summary
 * describing what happened (cancelled X, already-terminal Y).
 */
import type { Task } from './types.js';

export interface StopSummary {
  /** Number of tasks that were actively cancelled. */
  cancelled: number;
  /** Number of tasks already in a terminal state (no-op). */
  alreadyTerminal: number;
  /** Total tasks touched. */
  total: number;
}

/** Stop one task. Returns true iff the task was actively cancelled. */
export function stopOne(task: Task, reason?: string): boolean {
  if (isTaskTerminal(task)) return false;
  task.cancel(reason);
  return true;
}

/**
 * Stop multiple tasks with a shared reason. Order:
 *   1. All tasks get cancel(reason) called (idempotent)
 *   2. Awaited via the runtime if needed (caller's responsibility)
 *
 * For fire-and-forget stop, use `stopAll`.
 */
export function stopAll(tasks: Task[], reason?: string): StopSummary {
  let cancelled = 0;
  let alreadyTerminal = 0;
  for (const t of tasks) {
    if (isTaskTerminal(t)) {
      alreadyTerminal++;
    } else {
      t.cancel(reason);
      cancelled++;
    }
  }
  return { cancelled, alreadyTerminal, total: tasks.length };
}

/**
 * Stop a task and wait for its final result (if it had been started).
 * Returns the task's final TaskResult, or null if it was never started.
 *
 * Useful for cleanup paths: cancel + read whatever the task did.
 */
export async function stopAndAwait(task: Task, reason?: string): Promise<unknown> {
  if (isTaskTerminal(task)) return task.result();
  task.cancel(reason);
  // If the task was running, its runInternal promise will reject/resolve
  // once the abort signal propagates. We poll the result briefly; full
  // coordination is the runtime's responsibility.
  const start = Date.now();
  while (!isTaskTerminal(task) && Date.now() - start < 1000) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return task.result();
}

/** Returns true iff the task is in a terminal status. */
export function isTaskTerminal(task: Task): boolean {
  const s = task.status();
  return s === 'completed' || s === 'failed' || s === 'cancelled' || s === 'timeout';
}
