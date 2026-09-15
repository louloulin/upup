import { describe, expect, test } from 'bun:test';
import { BridgeSessionStore } from './session';

describe('BridgeSessionStore', () => {
  test('start creates session with unique id and idle status', () => {
    const store = new BridgeSessionStore();
    const s = store.start('client-a');
    expect(s.id.length).toBeGreaterThan(0);
    expect(s.status).toBe('idle');
    expect(s.clientId).toBe('client-a');
  });

  test('join creates in-memory entry with given id', () => {
    const store = new BridgeSessionStore();
    const s = store.join('persisted-id', 'phone-1');
    expect(s.id).toBe('persisted-id');
    expect(s.clientId).toBe('phone-1');
    expect(store.get('persisted-id')).toBe(s);
    expect(store.list().map((x) => x.id)).toContain('persisted-id');
  });

  test('join is idempotent and updates clientId', () => {
    const store = new BridgeSessionStore();
    const first = store.join('id-x', 'phone-1');
    const second = store.join('id-x', 'phone-2');
    expect(second).toBe(first);
    expect(second.clientId).toBe('phone-2');
    expect(store.list().filter((x) => x.id === 'id-x')).toHaveLength(1);
  });

  test('attach returns existing session by id', () => {
    const store = new BridgeSessionStore();
    const a = store.start('client-a');
    const b = store.attach(a.id, 'client-b');
    expect(b?.id).toBe(a.id);
    expect(b?.clientId).toBe('client-b');
  });

  test('attach returns null for unknown id', () => {
    const store = new BridgeSessionStore();
    expect(store.attach('missing', 'client-b')).toBeNull();
  });

  test('update mutates status and pushes to history', () => {
    const store = new BridgeSessionStore();
    const s = store.start('client-a');
    store.update(s.id, { status: 'thinking' });
    const fetched = store.get(s.id);
    expect(fetched?.status).toBe('thinking');
  });

  test('recordEvent appends to history', () => {
    const store = new BridgeSessionStore();
    const s = store.start('client-a');
    store.recordEvent(s.id, 'chat', { content: 'hi' });
    store.recordEvent(s.id, 'output', { result: 'hello' });
    const fetched = store.get(s.id);
    expect(fetched?.history.length).toBe(2);
    expect(fetched?.history[0]?.kind).toBe('chat');
    expect(fetched?.history[1]?.kind).toBe('output');
  });

  test('handoff transfers clientId but keeps history and resets to idle', () => {
    const store = new BridgeSessionStore();
    const a = store.start('client-a');
    store.update(a.id, { status: 'thinking' });
    store.recordEvent(a.id, 'chat', { x: 1 });
    store.handoff(a.id, 'client-b');
    const fetched = store.get(a.id);
    expect(fetched?.clientId).toBe('client-b');
    expect(fetched?.status).toBe('idle');
    expect(fetched?.history.length).toBe(1);
  });

  test('shutdown removes session and lists no longer include it', () => {
    const store = new BridgeSessionStore();
    const a = store.start('client-a');
    store.shutdown(a.id);
    expect(store.get(a.id)).toBeUndefined();
    expect(store.list().length).toBe(0);
  });

  test('list returns all active sessions', () => {
    const store = new BridgeSessionStore();
    const a = store.start('client-a');
    const b = store.start('client-b');
    const ids = store.list().map((s) => s.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });
});
