/**
 * Tests for worker-resume — failure recovery with exponential backoff.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D2)
 */

import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_WORKER_RESUME_POLICY,
  type WorkerResumeEvent,
  buildRetryDirective,
  runWithResume,
} from './worker-resume.js';

/** In-memory sleep that records the delays it was asked for. */
function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms) => {
      delays.push(ms);
      // No real wait — keeps the test fast.
    },
  };
}

describe('runWithResume', () => {
  test('returns result on first success, attempts=1', async () => {
    const events: WorkerResumeEvent[] = [];
    const r = await runWithResume(
      async () => 42,
      { sleep: async () => {} },
      (e) => events.push(e),
    );
    expect(r.result).toBe(42);
    expect(r.attempts).toBe(1);
    expect(r.finalError).toBeUndefined();
    expect(events).toEqual([]);
  });

  test('retries on failure, succeeds on 2nd attempt', async () => {
    const events: WorkerResumeEvent[] = [];
    let calls = 0;
    const { sleep, delays } = recordingSleep();
    const r = await runWithResume(
      async () => {
        calls++;
        if (calls === 1) throw new Error('transient');
        return 'ok';
      },
      { sleep, initialBackoffMs: 50, backoffFactor: 2 },
      (e) => events.push(e),
    );
    expect(r.result).toBe('ok');
    expect(r.attempts).toBe(2);
    expect(r.finalError).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(['retry']);
    expect(delays).toEqual([50]);
  });

  test('exhausts after maxAttempts, emits "exhausted" event with last error', async () => {
    const events: WorkerResumeEvent[] = [];
    const { sleep, delays } = recordingSleep();
    const r = await runWithResume(
      async () => {
        throw new Error('always fails');
      },
      { sleep, maxAttempts: 3, initialBackoffMs: 10, backoffFactor: 2, maxBackoffMs: 100 },
      (e) => events.push(e),
    );
    expect(r.result).toBeUndefined();
    expect(r.attempts).toBe(3);
    expect(r.finalError).toBeDefined();
    expect(r.finalError!.message).toBe('always fails');
    // events: retry, retry, exhausted
    expect(events.map((e) => e.type)).toEqual(['retry', 'retry', 'exhausted']);
    // delays: 10, 20 (both within maxBackoffMs=100)
    expect(delays).toEqual([10, 20]);
  });

  test('respects shouldRetry predicate and emits "escalated" on non-retryable', async () => {
    const events: WorkerResumeEvent[] = [];
    const { sleep, delays } = recordingSleep();
    const r = await runWithResume(
      async () => {
        throw new Error('logic bug: bad config');
      },
      {
        sleep,
        maxAttempts: 5,
        shouldRetry: (err) => !err.message.includes('bad config'),
      },
      (e) => events.push(e),
    );
    expect(r.attempts).toBe(1);
    expect(r.finalError?.message).toBe('logic bug: bad config');
    expect(events.map((e) => e.type)).toEqual(['escalated']);
    expect(delays).toEqual([]); // no sleep before escalation
  });

  test('exponential backoff sequence: initial * factor^(attempt-1)', async () => {
    const { sleep, delays } = recordingSleep();
    await runWithResume(
      async () => {
        throw new Error('fail');
      },
      { sleep, maxAttempts: 5, initialBackoffMs: 100, backoffFactor: 2, maxBackoffMs: 10000 },
      () => {},
    );
    // attempt 1 fails -> 100 * 2^0 = 100
    // attempt 2 fails -> 100 * 2^1 = 200
    // attempt 3 fails -> 100 * 2^2 = 400
    // attempt 4 fails -> 100 * 2^3 = 800
    expect(delays).toEqual([100, 200, 400, 800]);
  });

  test('backoff is capped at maxBackoffMs', async () => {
    const { sleep, delays } = recordingSleep();
    await runWithResume(
      async () => {
        throw new Error('fail');
      },
      { sleep, maxAttempts: 5, initialBackoffMs: 100, backoffFactor: 3, maxBackoffMs: 250 },
      () => {},
    );
    // 100, 300->250, 900->250, 2700->250
    expect(delays).toEqual([100, 250, 250, 250]);
  });

  test('maxAttempts=1 disables retries', async () => {
    const events: WorkerResumeEvent[] = [];
    const r = await runWithResume(
      async () => {
        throw new Error('fail');
      },
      { maxAttempts: 1, sleep: async () => {} },
      (e) => events.push(e),
    );
    expect(r.attempts).toBe(1);
    expect(r.finalError).toBeDefined();
    expect(events.map((e) => e.type)).toEqual(['exhausted']);
  });

  test('non-Error throws are wrapped in Error', async () => {
    const r = await runWithResume(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string error';
      },
      { maxAttempts: 1, sleep: async () => {} },
    );
    expect(r.finalError).toBeInstanceOf(Error);
    expect(r.finalError?.message).toBe('string error');
  });

  test('retry event has nextDelayMs matching the backoff for that attempt', async () => {
    const events: WorkerResumeEvent[] = [];
    await runWithResume(
      async () => {
        throw new Error('fail');
      },
      { sleep: async () => {}, initialBackoffMs: 75, backoffFactor: 2, maxAttempts: 3 },
      (e) => events.push(e),
    );
    const retryEvents = events.filter((e) => e.type === 'retry');
    expect(retryEvents[0]?.nextDelayMs).toBe(75);
    expect(retryEvents[1]?.nextDelayMs).toBe(150);
  });

  test('retry directive contains attempt number, next delay, and prior error', async () => {
    const events: WorkerResumeEvent[] = [];
    await runWithResume(
      async () => {
        throw new Error('upstream 503');
      },
      { sleep: async () => {}, initialBackoffMs: 100, maxAttempts: 2 },
      (e) => events.push(e),
    );
    const retry = events[0];
    expect(retry?.directive).toMatch(/retry-attempt=1/);
    expect(retry?.directive).toMatch(/next-delay=100ms/);
    expect(retry?.directive).toMatch(/upstream 503/);
  });
});

describe('buildRetryDirective', () => {
  test('formats attempt, delay, and error', () => {
    const d = buildRetryDirective(new Error('boom'), 2, 250);
    expect(d).toContain('retry-attempt=2');
    expect(d).toContain('next-delay=250ms');
    expect(d).toContain('boom');
  });
});

describe('DEFAULT_WORKER_RESUME_POLICY', () => {
  test('maxAttempts=3 (1 initial + 2 retries)', () => {
    expect(DEFAULT_WORKER_RESUME_POLICY.maxAttempts).toBe(3);
  });

  test('initial backoff is 100ms', () => {
    expect(DEFAULT_WORKER_RESUME_POLICY.initialBackoffMs).toBe(100);
  });

  test('backoffFactor is 2', () => {
    expect(DEFAULT_WORKER_RESUME_POLICY.backoffFactor).toBe(2);
  });

  test('maxBackoffMs is 2000', () => {
    expect(DEFAULT_WORKER_RESUME_POLICY.maxBackoffMs).toBe(2000);
  });

  test('default shouldRetry returns true for any error', () => {
    expect(DEFAULT_WORKER_RESUME_POLICY.shouldRetry!(new Error('x'), 1)).toBe(true);
    expect(DEFAULT_WORKER_RESUME_POLICY.shouldRetry!(new Error('x'), 99)).toBe(true);
  });
});
