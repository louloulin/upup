import { describe, test, expect } from 'bun:test';
import { createCapacityWake } from './capacityWake.js';

describe('capacityWake', () => {
  test('initial signal is not aborted', () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    const { signal, cleanup } = wake.signal();
    expect(signal.aborted).toBe(false);
    cleanup();
  });

  test('wake() aborts the pending merged signal', () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    const { signal, cleanup } = wake.signal();
    expect(signal.aborted).toBe(false);
    wake.wake();
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test('outer signal abort propagates to merged signal', () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    const { signal, cleanup } = wake.signal();
    outer.abort();
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test('cleanup() removes listeners — verified by no double-abort leak', () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    const { signal, cleanup } = wake.signal();
    cleanup();
    // After cleanup, wake() should not throw and a fresh signal should work.
    wake.wake();
    expect(signal.aborted).toBe(false);
    // New signal should also be independent
    const { signal: s2, cleanup: c2 } = wake.signal();
    expect(s2.aborted).toBe(false);
    c2();
  });

  test('after wake(), a fresh signal() returns a non-aborted one', () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    const { signal: s1, cleanup: c1 } = wake.signal();
    wake.wake();
    expect(s1.aborted).toBe(true);
    c1();
    const { signal: s2, cleanup: c2 } = wake.signal();
    expect(s2.aborted).toBe(false);
    c2();
  });

  test('multiple wake() calls arm fresh controllers independently', () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    wake.wake();
    wake.wake();
    wake.wake();
    const { signal, cleanup } = wake.signal();
    expect(signal.aborted).toBe(false);
    cleanup();
  });

  test('initial signal() after outer-already-aborted returns aborted signal', () => {
    const outer = new AbortController();
    outer.abort();
    const wake = createCapacityWake(outer.signal);
    const { signal, cleanup } = wake.signal();
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  test('can be used with sleep + abort pattern', async () => {
    const outer = new AbortController();
    const wake = createCapacityWake(outer.signal);
    const { signal, cleanup } = wake.signal();

    // Race: a 5s sleep vs a 50ms wake()
    const sleepPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5_000);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      });
    });

    setTimeout(() => wake.wake(), 50);

    await expect(sleepPromise).rejects.toThrow('aborted');
    cleanup();
  });
});
