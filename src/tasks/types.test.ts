import { describe, test, expect } from 'bun:test';
import {
  BaseTask,
  NOOP_LOGGER,
  createTaskId,
  isTaskKind,
  isTerminalStatus,
  type TaskContext,
  type TaskResult,
  type TaskKind,
  type TaskStatus,
} from './types.js';

class EchoTask extends BaseTask<{ message: string }, { received: string }> {
  constructor(input: { message: string }, name?: string) {
    super(input, 'local-agent', name);
  }
  protected async run(_ctx: TaskContext): Promise<TaskResult<{ received: string }>> {
    return this.runInternal(async () => {
      // Yield once so callers can observe the 'running' status before
      // the executor completes synchronously.
      await Promise.resolve();
      return { received: this.input.message };
    });
  }
}

class FailingTask extends BaseTask<{ reason: string }, never> {
  constructor(input: { reason: string }, name?: string) {
    super(input, 'local-agent', name);
  }
  protected async run(_ctx: TaskContext): Promise<TaskResult<never>> {
    return this.runInternal(async () => {
      throw new Error(this.input.reason);
    });
  }
}

class SleepTask extends BaseTask<{ ms: number }, { slept: number }> {
  constructor(input: { ms: number }, name?: string) {
    super(input, 'local-agent', name);
  }
  protected async run(_ctx: TaskContext): Promise<TaskResult<{ slept: number }>> {
    return this.runInternal(async () => {
      const t0 = Date.now();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.input.ms);
        this.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      });
      return { slept: Date.now() - t0 };
    });
  }
}

const ctx: TaskContext = { taskId: 'test', signal: new AbortController().signal, logger: NOOP_LOGGER };

describe('types — task id and kind helpers', () => {
  test('createTaskId returns a string with the given prefix', () => {
    const id = createTaskId('foo');
    expect(id.startsWith('foo-')).toBe(true);
  });

  test('createTaskId uses "task" as default prefix', () => {
    const id = createTaskId();
    expect(id.startsWith('task-')).toBe(true);
  });

  test('createTaskId returns unique values', () => {
    const a = createTaskId();
    const b = createTaskId();
    expect(a).not.toBe(b);
  });

  test('isTaskKind accepts known kinds', () => {
    for (const k of ['local-agent', 'local-shell', 'local-workflow', 'monitor-mcp', 'remote-agent', 'in-process-teammate']) {
      expect(isTaskKind(k)).toBe(true);
    }
  });

  test('isTaskKind rejects unknown', () => {
    expect(isTaskKind('unknown')).toBe(false);
    expect(isTaskKind('')).toBe(false);
  });
});

describe('types — isTerminalStatus', () => {
  test('completed/failed/cancelled/timeout are terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('timeout')).toBe(true);
  });

  test('pending/running are not terminal', () => {
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus('running')).toBe(false);
  });
});

describe('BaseTask — happy path', () => {
  test('starts in pending, returns null result', () => {
    const t = new EchoTask({ message: 'hi' });
    expect(t.status()).toBe('pending');
    expect(t.result()).toBeNull();
  });

  test('start() transitions pending → running → completed', async () => {
    const t = new EchoTask({ message: 'hi' });
    expect(t.status()).toBe('pending');
    const promise = t.start(ctx);
    // microtask: status should be 'running' now (executor yields once)
    await Promise.resolve();
    expect(t.status()).toBe('running');
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ received: 'hi' });
    expect(t.status()).toBe('completed');
    expect(t.result()?.ok).toBe(true);
  });

  test('result includes timing fields', async () => {
    const t = new EchoTask({ message: 'hi' });
    const result = await t.start(ctx);
    expect(result.startedAt).toBeGreaterThan(0);
    expect(result.finishedAt).toBeGreaterThanOrEqual(result.startedAt);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('BaseTask — failure path', () => {
  test('thrown error becomes result.ok=false, status=failed', async () => {
    const t = new FailingTask({ reason: 'boom' });
    const result = await t.start(ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('exception');
    expect(result.error?.message).toBe('boom');
    expect(t.status()).toBe('failed');
  });

  test('non-Error throws are still captured as exception', async () => {
    class ThrowStringTask extends BaseTask<unknown, never> {
      constructor() {
        super(undefined, 'local-agent');
      }
      protected async run(_ctx: TaskContext): Promise<TaskResult<never>> {
        return this.runInternal(async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'a string';
        });
      }
    }
    const t = new ThrowStringTask();
    const result = await t.start(ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('exception');
    expect(result.error?.message).toBe('a string');
  });
});

describe('BaseTask — cancel', () => {
  test('cancel on pending transitions to cancelled', () => {
    const t = new EchoTask({ message: 'hi' });
    t.cancel('user');
    expect(t.status()).toBe('cancelled');
    expect(t.getCancelReason()).toBe('user');
  });

  test('cancel during running task aborts and sets cancelled', async () => {
    const t = new SleepTask({ ms: 10_000 });
    const promise = t.start(ctx);
    await Promise.resolve();
    t.cancel('shutdown');
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('aborted');
    expect(t.status()).toBe('cancelled');
  });

  test('cancel after completion is a no-op', async () => {
    const t = new EchoTask({ message: 'hi' });
    await t.start(ctx);
    t.cancel('too late');
    expect(t.status()).toBe('completed');
  });

  test('cancel on already-cancelled is a no-op', () => {
    const t = new EchoTask({ message: 'hi' });
    t.cancel();
    t.cancel();
    t.cancel('again');
    expect(t.status()).toBe('cancelled');
  });

  test('start() on a cancelled task throws', async () => {
    const t = new EchoTask({ message: 'hi' });
    t.cancel();
    await expect(t.start(ctx)).rejects.toThrow(/cannot start from terminal status/);
  });
});

describe('BaseTask — name resolution', () => {
  test('uses input.name if provided', () => {
    const t = new EchoTask({ message: 'hi' }, 'custom-name');
    expect(t.name).toBe('custom-name');
  });

  test('uses input.command if no name', () => {
    class ShellLikeTask extends BaseTask<{ command: string }, unknown> {
      constructor(input: { command: string }) {
        super(input, 'local-shell');
      }
      protected async run(_ctx: TaskContext): Promise<TaskResult<unknown>> {
        return this.runInternal(async () => ({}));
      }
    }
    const t = new ShellLikeTask({ command: 'npm test' });
    expect(t.name).toBe('local-shell:npm test');
  });

  test('falls back to kind if no useful field', () => {
    const t = new EchoTask({ message: 'hi' });
    expect(t.name).toBe('local-agent');
  });
});
