import { describe, expect, test } from 'bun:test';
import { createMessageQueue } from './message-queue';

describe('@upup/utils — createMessageQueue', () => {
  test('returns a fresh instance per call (no cross-contamination)', () => {
    const a = createMessageQueue();
    const b = createMessageQueue();
    a.enqueue({ text: 'for-a', priority: 'next', enqueuedAt: 1 });
    expect(a.length()).toBe(1);
    expect(b.length()).toBe(0);
    expect(a.snapshot()[0].text).toBe('for-a');
  });

  test('priority order: next drained before later', () => {
    const q = createMessageQueue();
    q.enqueue({ text: 'later-1', priority: 'later', enqueuedAt: 1 });
    q.enqueue({ text: 'next-1', priority: 'next', enqueuedAt: 2 });
    q.enqueue({ text: 'later-2', priority: 'later', enqueuedAt: 3 });
    const drained = q.dequeueAll();
    expect(drained.map((m) => m.text)).toEqual(['next-1', 'later-1', 'later-2']);
  });

  test('subscribe/unsubscribe lifecycle', () => {
    const q = createMessageQueue();
    let calls = 0;
    const off = q.subscribe(() => { calls += 1; });
    q.enqueue({ text: 'x', priority: 'next', enqueuedAt: 1 });
    q.enqueue({ text: 'y', priority: 'next', enqueuedAt: 2 });
    expect(calls).toBe(2);
    off();
    q.enqueue({ text: 'z', priority: 'next', enqueuedAt: 3 });
    expect(calls).toBe(2);
  });

  test('clear empties the queue and notifies subscribers', () => {
    const q = createMessageQueue();
    let calls = 0;
    q.subscribe(() => { calls += 1; });
    q.enqueue({ text: 'x', priority: 'next', enqueuedAt: 1 });
    q.clear();
    expect(q.isEmpty()).toBe(true);
    expect(calls).toBe(2); // enqueue + clear
  });

  test('snapshot is frozen', () => {
    const q = createMessageQueue();
    q.enqueue({ text: 'x', priority: 'next', enqueuedAt: 1 });
    const snap = q.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });
});
