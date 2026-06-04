import { describe, test, expect } from 'bun:test';
import { LocalShellTask } from './LocalShellTask.js';
import { NOOP_LOGGER, type TaskContext } from './types.js';

const ctx: TaskContext = { taskId: 'shell-test', signal: new AbortController().signal, logger: NOOP_LOGGER };

describe('LocalShellTask — happy path', () => {
  test('runs echo and captures stdout', async () => {
    const t = new LocalShellTask({ command: 'echo', args: ['hello', 'world'], name: 'echo-test' });
    const result = await t.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.stdout).toBe('hello world\n');
    expect(result.value?.exitCode).toBe(0);
    expect(result.value?.killed).toBe(false);
    expect(t.status()).toBe('completed');
  });

  test('runs with no args', async () => {
    const t = new LocalShellTask({ command: 'true' });
    const result = await t.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.exitCode).toBe(0);
  });

  test('captures stderr', async () => {
    const t = new LocalShellTask({ command: 'sh', args: ['-c', 'echo to-stderr 1>&2'] });
    const result = await t.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.stderr).toContain('to-stderr');
  });
});

describe('LocalShellTask — failure', () => {
  test('non-zero exit code is a failure (default)', async () => {
    const t = new LocalShellTask({ command: 'sh', args: ['-c', 'exit 7'] });
    const result = await t.start(ctx);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('nonzero-exit');
    expect(result.error?.detail?.exitCode).toBe(7);
    expect(t.status()).toBe('failed');
  });

  test('non-zero exit tolerated when tolerateNonZero=true', async () => {
    const t = new LocalShellTask({ command: 'sh', args: ['-c', 'exit 7'], tolerateNonZero: true });
    const result = await t.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value?.exitCode).toBe(7);
  });

  test('command not found surfaces as exception (Bun.spawn throws ENOENT)', async () => {
    const t = new LocalShellTask({ command: 'this-command-does-not-exist-12345' });
    const result = await t.start(ctx);
    // Bun.spawn throws when the binary is missing; the runInternal
    // wrapper classifies any non-{nonzero-exit,timeout,unsupported}
    // error as 'exception'. The error message is propagated as-is.
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('exception');
    expect(result.error?.message.length).toBeGreaterThan(0);
  });
});

describe('LocalShellTask — cancel', () => {
  test('cancel during long-running command kills the process', async () => {
    const t = new LocalShellTask({ command: 'sleep', args: ['30'] });
    const promise = t.start(ctx);
    setTimeout(() => t.cancel('user stop'), 50);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('aborted');
    expect(t.status()).toBe('cancelled');
  });

  test('cancel after completion is no-op', async () => {
    const t = new LocalShellTask({ command: 'true' });
    await t.start(ctx);
    t.cancel();
    expect(t.status()).toBe('completed');
  });
});

describe('LocalShellTask — output capping', () => {
  test('respects maxOutputBytes cap', async () => {
    // Generate ~100KB of stdout
    const t = new LocalShellTask({
      command: 'sh',
      args: ['-c', 'yes A | head -c 100000'],
      maxOutputBytes: 1024,
    });
    const result = await t.start(ctx);
    expect(result.ok).toBe(true);
    expect(result.value!.stdout.length).toBeLessThanOrEqual(1024);
  });
});
