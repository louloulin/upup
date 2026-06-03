/**
 * Tests for the in-process event bus.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/event-bus
 */

import { describe, expect, test } from 'bun:test';
import { createEventBus, topicMatches } from './event-bus.js';

describe('topicMatches', () => {
  test('exact match', () => {
    expect(topicMatches('market.tick', 'market.tick')).toBe(true);
  });

  test('mismatch', () => {
    expect(topicMatches('market.tick', 'market.bar')).toBe(false);
  });

  test('wildcard star matches any topic of same length', () => {
    expect(topicMatches('market.*', 'market.tick')).toBe(true);
    expect(topicMatches('market.*', 'market.bar')).toBe(true);
  });

  test('wildcard with different segment count does not match', () => {
    expect(topicMatches('market.*', 'market.tick.fast')).toBe(false);
  });

  test('wildcard in any segment matches that segment', () => {
    expect(topicMatches('market.*.close', 'market.tick.close')).toBe(true);
  });

  test('global star matches any topic', () => {
    expect(topicMatches('*', 'market.tick')).toBe(true);
    expect(topicMatches('*', 'anything.else.at.all')).toBe(true);
  });
});

describe('createEventBus', () => {
  test('on() delivers matching events to subscribers', () => {
    const bus = createEventBus();
    const received: string[] = [];
    bus.on('market.tick', (e) => received.push(e.payload as string));
    bus.emit('market.tick', 'AAPL up');
    bus.emit('market.tick', 'MSFT down');
    expect(received).toEqual(['AAPL up', 'MSFT down']);
  });

  test('wildcard subscription receives all matching events', () => {
    const bus = createEventBus();
    const received: string[] = [];
    bus.on('market.*', (e) => received.push(e.payload as string));
    bus.emit('market.tick', 'tick');
    bus.emit('market.bar', 'bar');
    bus.emit('news.filing', 'unrelated');
    expect(received).toEqual(['tick', 'bar']);
  });

  test('once() unsubscribes after first matching event', () => {
    const bus = createEventBus();
    let count = 0;
    bus.once('alert', () => count++);
    bus.emit('alert', 'first');
    bus.emit('alert', 'second');
    expect(count).toBe(1);
  });

  test('off() removes a specific handler', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    const a = () => calls.push('a');
    const b = () => calls.push('b');
    bus.on('topic', a);
    bus.on('topic', b);
    bus.off('topic', a);
    bus.emit('topic', 'x');
    expect(calls).toEqual(['b']);
  });

  test('returned unsubscribe function from on() removes the handler', () => {
    const bus = createEventBus();
    let count = 0;
    const unsub = bus.on('topic', () => count++);
    bus.emit('topic', 'x');
    unsub();
    bus.emit('topic', 'x');
    expect(count).toBe(1);
  });

  test('emit() assigns monotonically increasing seq', () => {
    const bus = createEventBus();
    const a = bus.emit('t', 1);
    const b = bus.emit('t', 2);
    const c = bus.emit('t', 3);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  test('replay buffer replays matching history on subscribe with replay: true', () => {
    const bus = createEventBus();
    bus.emit('market.tick', 'old1');
    bus.emit('market.tick', 'old2');
    bus.emit('news.filing', 'unrelated');
    const received: string[] = [];
    bus.on('market.*', (e) => received.push(e.payload as string), { replay: true });
    expect(received).toEqual(['old1', 'old2']);
  });

  test('replay buffer only replays matching topics', () => {
    const bus = createEventBus();
    bus.emit('market.tick', 'a');
    bus.emit('news.filing', 'b');
    const received: string[] = [];
    bus.on('market.*', (e) => received.push(e.payload as string), { replay: true });
    expect(received).toEqual(['a']);
  });

  test('buffer caps at bufferSize, oldest events dropped', () => {
    const bus = createEventBus({ bufferSize: 3 });
    for (let i = 1; i <= 5; i++) bus.emit('t', i);
    expect(bus.historyLength()).toBe(3);
    const received: number[] = [];
    bus.on('t', (e) => received.push(e.payload as number), { replay: true });
    expect(received).toEqual([3, 4, 5]);
  });

  test('clearHistory() drops the buffer but keeps live subscribers', () => {
    const bus = createEventBus();
    bus.emit('t', 'past');
    bus.clearHistory();
    expect(bus.historyLength()).toBe(0);
    const received: string[] = [];
    bus.on('t', (e) => received.push(e.payload as string), { replay: true });
    expect(received).toEqual([]);
    bus.emit('t', 'live');
    expect(received).toEqual(['live']);
  });

  test('one misbehaving handler does not break others', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('t', () => {
      throw new Error('boom');
    });
    bus.on('t', (e) => calls.push(e.payload as string));
    // Suppress the expected stderr noise from the bus error handler.
    const orig = console.error;
    console.error = () => {};
    try {
      bus.emit('t', 'still delivered');
    } finally {
      console.error = orig;
    }
    expect(calls).toEqual(['still delivered']);
  });

  test('events carry timestamp and seq in the envelope', () => {
    const bus = createEventBus();
    let captured: { topic: string; payload: number; ts: number; seq: number } | null = null;
    bus.on('t', (e) => {
      captured = {
        topic: e.topic,
        payload: e.payload as number,
        ts: e.timestamp,
        seq: e.seq,
      };
    });
    const before = Date.now();
    const seq = bus.emit('t', 42);
    const after = Date.now();
    expect(captured).not.toBeNull();
    expect(captured!.topic).toBe('t');
    expect(captured!.payload).toBe(42);
    expect(captured!.seq).toBe(seq);
    expect(captured!.ts).toBeGreaterThanOrEqual(before);
    expect(captured!.ts).toBeLessThanOrEqual(after);
  });
});
