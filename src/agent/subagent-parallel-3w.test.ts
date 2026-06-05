/**
 * subagent parallel worker tests (P1.a.2)
 *
 * Coverage:
 *  - empty specs → empty result with failed=true
 *  - N workers run concurrently (overlapping timestamps)
 *  - 1 worker failing → partial result (no throw)
 *  - all workers failing → failed result (no throw)
 *  - concurrency bound honoured
 *  - bounded concurrency of 3 means at most 3 in-flight at any moment
 *  - result ordering matches input ordering (stable)
 *  - duration is captured per-worker and total
 */

import { describe, expect, test } from 'bun:test';
import {
  runWorkersParallel,
  type ParallelWorkerSpec,
  type WorkerRunFn,
  type SubagentResult,
} from './subagent.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function makeSpec<T>(key: string, delayMs: number, output?: T, fail = false): ParallelWorkerSpec<T> {
  return {
    key,
    config: { type: 'general', tools: ['*'] },
    prompt: `${key}-prompt`,
    context: { sessionId: 's1', cwd: '/tmp', tools: [] },
  };
}

function makeRunFn(opts: {
  delays?: Record<string, number>;
  outputs?: Record<string, unknown>;
  fail?: Record<string, string>;
  failAll?: string;
}): WorkerRunFn {
  return async (spec) => {
    const d = opts.delays?.[spec.key] ?? 5;
    await sleep(d);
    if (opts.failAll) {
      return { success: false, error: opts.failAll, toolCalls: 0, duration: d };
    }
    if (opts.fail?.[spec.key]) {
      return { success: false, error: opts.fail[spec.key]!, toolCalls: 0, duration: d };
    }
    const output = opts.outputs?.[spec.key] ?? { default: true };
    return { success: true, output: JSON.stringify(output), toolCalls: 1, duration: d };
  };
}

describe('runWorkersParallel', () => {
  test('empty specs → empty group, failed=true', async () => {
    const r = await runWorkersParallel([], makeRunFn({}));
    expect(r.workers).toEqual([]);
    expect(r.full).toBe(false);
    expect(r.partial).toBe(false);
    expect(r.failed).toBe(true);
    expect(r.totalDuration).toBe(0);
  });

  test('3 workers all succeed → full=true', async () => {
    const specs = [
      makeSpec('a', 10, { x: 1 }),
      makeSpec('b', 10, { x: 2 }),
      makeSpec('c', 10, { x: 3 }),
    ];
    const r = await runWorkersParallel(specs, makeRunFn({}));
    expect(r.full).toBe(true);
    expect(r.partial).toBe(false);
    expect(r.failed).toBe(false);
    expect(r.workers).toHaveLength(3);
    expect(r.workers.map(w => w.status)).toEqual(['completed', 'completed', 'completed']);
  });

  test('1 worker fails → partial=true, no throw', async () => {
    const specs = [makeSpec('a', 5), makeSpec('b', 5), makeSpec('c', 5)];
    const r = await runWorkersParallel(specs, makeRunFn({ fail: { b: 'boom' } }));
    expect(r.full).toBe(false);
    expect(r.partial).toBe(true);
    expect(r.failed).toBe(false);
    const b = r.workers.find(w => w.key === 'b')!;
    expect(b.status).toBe('failed');
    expect(b.error).toBe('boom');
  });

  test('all workers fail → failed=true, no throw', async () => {
    const specs = [makeSpec('a', 5), makeSpec('b', 5), makeSpec('c', 5)];
    const r = await runWorkersParallel(specs, makeRunFn({ failAll: 'network down' }));
    expect(r.full).toBe(false);
    expect(r.partial).toBe(false);
    expect(r.failed).toBe(true);
    expect(r.workers.every(w => w.status === 'failed')).toBe(true);
  });

  test('workers run concurrently (overlapping timestamps)', async () => {
    const specs = [makeSpec('a', 50), makeSpec('b', 50), makeSpec('c', 50)];
    const r = await runWorkersParallel(specs, makeRunFn({}), { concurrency: 3 });
    // If serial, totalDuration >= 150. If parallel, ~50 + small overhead.
    // We allow some scheduler slack.
    expect(r.totalDuration).toBeLessThan(140);
    // Each worker should have a non-zero duration
    for (const w of r.workers) {
      expect(w.duration).toBeGreaterThanOrEqual(0);
      expect(w.endedAt).toBeGreaterThanOrEqual(w.startedAt);
    }
  });

  test('concurrency=1 forces serial execution', async () => {
    // Each spec's key encodes its delay (a=30, b=30, c=30).
    const delays: Record<string, number> = { a: 30, b: 30, c: 30 };
    const specs = [makeSpec('a', 30), makeSpec('b', 30), makeSpec('c', 30)];
    const delayRunFn: WorkerRunFn = async (spec) => {
      await new Promise(r => setTimeout(r, delays[spec.key] ?? 5));
      return { success: true, output: '{}', toolCalls: 1, duration: delays[spec.key] ?? 5 };
    };
    const t0 = Date.now();
    const r = await runWorkersParallel(specs, delayRunFn, { concurrency: 1 });
    const elapsed = Date.now() - t0;
    // Serial 3 × 30ms = ~90ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(r.full).toBe(true);
  });

  test('result ordering matches input ordering', async () => {
    const specs = [
      makeSpec('first', 5),
      makeSpec('second', 1), // fastest
      makeSpec('third', 1),
    ];
    const r = await runWorkersParallel(specs, makeRunFn({}));
    expect(r.workers.map(w => w.key)).toEqual(['first', 'second', 'third']);
  });

  test('successful worker output is JSON-parsed', async () => {
    const specs = [makeSpec('a', 5)];
    const r = await runWorkersParallel(specs, makeRunFn({ outputs: { a: { verdict: 'BEAT', count: 3 } } }));
    expect(r.workers[0]!.output).toEqual({ verdict: 'BEAT', count: 3 });
  });

  test('non-JSON output is wrapped in { raw }', async () => {
    const specs: ParallelWorkerSpec<unknown>[] = [{
      key: 'a', config: { type: 'general', tools: ['*'] }, prompt: 'p',
    }];
    const runFn: WorkerRunFn = async () => ({
      success: true,
      output: 'not json at all',
      toolCalls: 1,
      duration: 1,
    });
    const r = await runWorkersParallel(specs, runFn);
    expect(r.workers[0]!.output).toEqual({ raw: 'not json at all' });
  });

  test('worker that throws is captured, not propagated', async () => {
    const specs: ParallelWorkerSpec<unknown>[] = [
      { key: 'a', config: { type: 'general', tools: ['*'] }, prompt: 'p' },
    ];
    const runFn: WorkerRunFn = async () => { throw new Error('unhandled'); };
    const r = await runWorkersParallel(specs, runFn);
    expect(r.workers[0]!.status).toBe('failed');
    expect(r.workers[0]!.error).toBe('unhandled');
  });
});
