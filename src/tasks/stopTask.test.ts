import { describe, test, expect } from 'bun:test';
import { stopOne, stopAll, stopAndAwait, isTaskTerminal } from './stopTask.js';
import { LocalShellTask } from './LocalShellTask.js';
import { NOOP_LOGGER, type TaskContext } from './types.js';

const ctx: TaskContext = { taskId: 'stop-test', signal: new AbortController().signal, logger: NOOP_LOGGER };

describe('stopOne', () => {
  test('cancels a pending task', () => {
    const t = new LocalShellTask({ command: 'true' });
    expect(stopOne(t, 'test reason')).toBe(true);
    expect(t.status()).toBe('cancelled');
  });

  test('returns false for already-completed task', async () => {
    const t = new LocalShellTask({ command: 'true' });
    await t.start(ctx);
    expect(stopOne(t)).toBe(false);
  });

  test('returns false for already-cancelled task', () => {
    const t = new LocalShellTask({ command: 'true' });
    t.cancel('first');
    expect(stopOne(t, 'second')).toBe(false);
  });
});

describe('stopAll', () => {
  test('cancels multiple tasks with shared reason', () => {
    const tasks = [
      new LocalShellTask({ command: 'true' }),
      new LocalShellTask({ command: 'ls' }),
      new LocalShellTask({ command: 'pwd' }),
    ];
    const summary = stopAll(tasks, 'shutdown');
    expect(summary.cancelled).toBe(3);
    expect(summary.alreadyTerminal).toBe(0);
    expect(summary.total).toBe(3);
    for (const t of tasks) expect(t.status()).toBe('cancelled');
  });

  test('skips already-terminal tasks', async () => {
    const done = new LocalShellTask({ command: 'true' });
    await done.start(ctx);
    const fresh = new LocalShellTask({ command: 'ls' });
    const summary = stopAll([done, fresh], 'shutdown');
    expect(summary.cancelled).toBe(1);
    expect(summary.alreadyTerminal).toBe(1);
    expect(summary.total).toBe(2);
  });

  test('handles empty array', () => {
    expect(stopAll([])).toEqual({ cancelled: 0, alreadyTerminal: 0, total: 0 });
  });
});

describe('stopAndAwait', () => {
  test('returns null for never-started task', async () => {
    const t = new LocalShellTask({ command: 'true' });
    const result = await stopAndAwait(t);
    expect(result).toBeNull();
  });

  test('returns result for already-completed task', async () => {
    const t = new LocalShellTask({ command: 'echo', args: ['done'] });
    await t.start(ctx);
    const result = await stopAndAwait(t);
    expect(result).not.toBeNull();
    expect((result as TaskResult).ok).toBe(true);
  });

  test('cancels running task and returns its result', async () => {
    const t = new LocalShellTask({ command: 'sleep', args: ['30'] });
    const promise = t.start(ctx);
    setTimeout(() => { stopAndAwait(t, 'user'); }, 30);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(t.status()).toBe('cancelled');
  });
});

describe('isTaskTerminal', () => {
  test('true for completed/failed/cancelled/timeout', async () => {
    const t = new LocalShellTask({ command: 'true' });
    await t.start(ctx);
    expect(isTaskTerminal(t)).toBe(true);
  });

  test('false for pending', () => {
    const t = new LocalShellTask({ command: 'true' });
    expect(isTaskTerminal(t)).toBe(false);
  });

  test('true for cancelled', () => {
    const t = new LocalShellTask({ command: 'true' });
    t.cancel();
    expect(isTaskTerminal(t)).toBe(true);
  });
});

// Avoid unused import warning
type TaskResult = import('./types.js').TaskResult;
