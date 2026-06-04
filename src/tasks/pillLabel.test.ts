import { describe, test, expect } from 'bun:test';
import { pillLabel, pillOnly, pillFromResult } from './pillLabel.js';
import { LocalShellTask } from './LocalShellTask.js';
import { NOOP_LOGGER, type TaskContext, type TaskResult } from './types.js';

const ctx: TaskContext = { taskId: 'pill-test', signal: new AbortController().signal, logger: NOOP_LOGGER };

describe('pillOnly', () => {
  test('renders each status with stable prefix', () => {
    expect(pillOnly('pending')).toBe('[...]    ');
    expect(pillOnly('running')).toBe('[...]    ');
    expect(pillOnly('completed')).toBe('[OK]     ');
    expect(pillOnly('failed')).toBe('[FAIL]   ');
    expect(pillOnly('cancelled')).toBe('[CANCEL] ');
    expect(pillOnly('timeout')).toBe('[TIMEOUT]');
  });

  test('all pills are PILL_WIDTH chars wide', () => {
    for (const s of ['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'] as const) {
      expect(pillOnly(s).length).toBe(9);
    }
  });
});

describe('pillLabel — for a task', () => {
  test('pending task shows (pending) suffix', () => {
    const t = new LocalShellTask({ command: 'echo' });
    const out = pillLabel(t);
    expect(out).toContain('[...]');
    expect(out).toContain('(pending)');
  });

  test('completed task shows duration', async () => {
    const t = new LocalShellTask({ command: 'true' });
    await t.start(ctx);
    const out = pillLabel(t);
    expect(out).toContain('[OK]');
    expect(out).toMatch(/ms$/);
  });

  test('failed task shows [FAIL]', async () => {
    const t = new LocalShellTask({ command: 'sh', args: ['-c', 'exit 1'] });
    await t.start(ctx);
    const out = pillLabel(t);
    expect(out).toContain('[FAIL]');
  });
});

describe('pillFromResult', () => {
  test('ok result → [OK] pill + duration', () => {
    const result: TaskResult = {
      ok: true,
      value: 'done',
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_000_500,
      durationMs: 500,
    };
    expect(pillFromResult('test-task', result)).toBe('[OK]     test-task                          500ms');
  });

  test('failed result → [FAIL] pill + duration', () => {
    const result: TaskResult = {
      ok: false,
      error: { code: 'exception', message: 'boom' },
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_000_3500,
      durationMs: 3500,
    };
    expect(pillFromResult('my-task', result)).toBe('[FAIL]   my-task                            3.5s');
  });

  test('truncates long names with ellipsis', () => {
    const result: TaskResult = {
      ok: true,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_000_100,
      durationMs: 100,
    };
    const longName = 'a'.repeat(60);
    const out = pillFromResult(longName, result);
    expect(out).toContain('\u2026'); // ellipsis
  });
});
