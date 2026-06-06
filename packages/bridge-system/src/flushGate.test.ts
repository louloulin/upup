import { describe, test, expect } from 'bun:test';
import { FlushGate } from './flushGate.js';

describe('FlushGate', () => {
  test('initial state: not active, 0 pending', () => {
    const gate = new FlushGate<string>();
    expect(gate.active).toBe(false);
    expect(gate.pendingCount).toBe(0);
  });

  test('start() activates the gate', () => {
    const gate = new FlushGate<string>();
    gate.start();
    expect(gate.active).toBe(true);
  });

  test('enqueue returns false when not active', () => {
    const gate = new FlushGate<string>();
    expect(gate.enqueue('a')).toBe(false);
    expect(gate.pendingCount).toBe(0);
  });

  test('enqueue returns true and queues when active', () => {
    const gate = new FlushGate<string>();
    gate.start();
    expect(gate.enqueue('a', 'b', 'c')).toBe(true);
    expect(gate.pendingCount).toBe(3);
  });

  test('end() returns queued items and deactivates', () => {
    const gate = new FlushGate<string>();
    gate.start();
    gate.enqueue('a', 'b');
    const drained = gate.end();
    expect(drained).toEqual(['a', 'b']);
    expect(gate.active).toBe(false);
    expect(gate.pendingCount).toBe(0);
  });

  test('after end(), enqueue returns false (caller sends directly)', () => {
    const gate = new FlushGate<string>();
    gate.start();
    gate.end();
    expect(gate.enqueue('x')).toBe(false);
  });

  test('drop() discards all items and deactivates, returns count', () => {
    const gate = new FlushGate<string>();
    gate.start();
    gate.enqueue('a', 'b', 'c', 'd');
    const dropped = gate.drop();
    expect(dropped).toBe(4);
    expect(gate.active).toBe(false);
    expect(gate.pendingCount).toBe(0);
  });

  test('deactivate() clears active without dropping items', () => {
    const gate = new FlushGate<string>();
    gate.start();
    gate.enqueue('a', 'b');
    gate.deactivate();
    expect(gate.active).toBe(false);
    expect(gate.pendingCount).toBe(2);
  });

  test('after deactivate, enqueue returns false but items are still queued for next start()', () => {
    const gate = new FlushGate<string>();
    gate.start();
    gate.enqueue('a');
    gate.deactivate();
    // Caller now sends 'a' directly, and a future start() + end() would only
    // see items queued during the new active period.
    expect(gate.enqueue('b')).toBe(false);
  });

  test('start() can be called again after end() (new flush cycle)', () => {
    const gate = new FlushGate<string>();
    gate.start();
    gate.enqueue('cycle1');
    gate.end();
    gate.start();
    gate.enqueue('cycle2');
    const drained = gate.end();
    expect(drained).toEqual(['cycle2']);
  });

  test('works with non-string types', () => {
    const gate = new FlushGate<{ id: number; text: string }>();
    gate.start();
    gate.enqueue({ id: 1, text: 'a' }, { id: 2, text: 'b' });
    const drained = gate.end();
    expect(drained).toEqual([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
    ]);
  });

  test('end() with no pending items returns empty array', () => {
    const gate = new FlushGate<number>();
    gate.start();
    expect(gate.end()).toEqual([]);
  });

  test('drop() with no pending items returns 0', () => {
    const gate = new FlushGate<number>();
    gate.start();
    expect(gate.drop()).toBe(0);
  });
});
