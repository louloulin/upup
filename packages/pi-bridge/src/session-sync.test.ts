import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deserializeSession,
  serializeSession,
  sessionHash,
  SessionSync,
  type SessionState,
} from './session-sync';

function fixture(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 's-1',
    createdAt: 1717480000000,
    updatedAt: 1717480800000,
    clientId: 'device-a',
    status: 'idle',
    history: [
      { kind: 'chat', payload: { content: 'hi' }, at: 1717480000000 },
      { kind: 'output', payload: { result: 'hello' }, at: 1717480001000 },
    ],
    messages: [
      { role: 'user', content: 'analyze 600519', at: 1717480000000 },
      { role: 'assistant', content: '...', at: 1717480001000 },
    ],
    toolHistory: [
      { tool: 'finance_search', args: { symbol: '600519' }, result: '{"price":1700}', at: 1717480000500 },
    ],
    scratchpad: 'short scratchpad',
    featureGates: { 'kairos-proactive': false, 'bridge-v2': true },
    metadata: {},
    ...overrides,
  };
}

describe('session-sync serialize/deserialize', () => {
  test('round-trips a simple session', () => {
    const s = fixture();
    const json = serializeSession(s);
    const back = deserializeSession(json);
    expect(back).toEqual(s);
  });

  test('object key insertion order does not affect output', () => {
    const s1: SessionState = {
      sessionId: 's', createdAt: 1, updatedAt: 1, clientId: 'a', status: 'idle',
      history: [], messages: [], toolHistory: [], scratchpad: '',
      featureGates: { a: true, b: false },
      metadata: {},
    };
    const s2: SessionState = {
      metadata: {},
      featureGates: { b: false, a: true },
      toolHistory: [],
      messages: [],
      history: [],
      status: 'idle',
      clientId: 'a',
      updatedAt: 1,
      createdAt: 1,
      sessionId: 's',
      scratchpad: '',
    };
    expect(serializeSession(s1)).toBe(serializeSession(s2));
  });

  test('blobs > 1MB are truncated with annotation', () => {
    const big = 'x'.repeat(1024 * 1024 + 100);
    const s = fixture({ scratchpad: big });
    const json = serializeSession(s);
    expect(json).toContain('originalSize=');
    expect(json).toContain('keptSize=1048576');
    const back = deserializeSession(json);
    expect(back.scratchpad.length).toBeLessThan(big.length);
  });

  test('blobs <= 1MB pass through unchanged', () => {
    const s = fixture({ scratchpad: 'small' });
    const json = serializeSession(s);
    expect(json).not.toContain('truncated');
    expect(deserializeSession(json).scratchpad).toBe('small');
  });

  test('sessionHash is stable for identical content', () => {
    expect(sessionHash(fixture())).toBe(sessionHash(fixture()));
  });

  test('sessionHash differs when scratchpad changes', () => {
    expect(sessionHash(fixture())).not.toBe(sessionHash(fixture({ scratchpad: 'different' })));
  });

  test('rejects malformed JSON', () => {
    expect(() => deserializeSession('not json')).toThrow();
    expect(() => deserializeSession('{}')).toThrow();
    expect(() => deserializeSession('{"foo":"bar"}')).toThrow();
  });
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'session-sync-'));
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('SessionSync disk persistence', () => {
  test('save then load round-trips through disk', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    const s = fixture({ sessionId: 'round-trip' });
    await sync.save(s);
    const back = await sync.load('round-trip');
    expect(back).toEqual(s);
  });

  test('load returns null for missing session', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    expect(await sync.load('nope')).toBeNull();
  });

  test('save creates storageDir if missing', async () => {
    const deep = join(tmpDir, 'nested', 'sessions');
    const sync = new SessionSync({ storageDir: deep });
    await sync.save(fixture({ sessionId: 'deep' }));
    expect(existsSync(join(deep, 'deep.json'))).toBe(true);
  });

  test('resume stamps metadata and increments resumedCount', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    await sync.save(fixture({ sessionId: 'r' }));
    const before = Date.now();
    const r = await sync.resume('r', 'phone-1');
    expect(r).not.toBeNull();
    expect(r?.metadata.resumedFromDevice).toBe('phone-1');
    expect(r?.metadata.resumedAt).toBeGreaterThanOrEqual(before);
    expect(r?.metadata.resumedCount).toBe(1);
    const r2 = await sync.resume('r', 'tablet-2');
    expect(r2?.metadata.resumedFromDevice).toBe('tablet-2');
    expect(r2?.metadata.resumedCount).toBe(2);
  });

  test('mergeWithBackup archives loser to .conflict-<ts>.json', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    const local = fixture({ sessionId: 'm', updatedAt: 100 });
    const remote = fixture({ sessionId: 'm', updatedAt: 200, scratchpad: 'remote' });
    const { winner, loserPath } = await sync.mergeWithBackup(local, remote);
    expect(winner.scratchpad).toBe('remote');
    expect(existsSync(loserPath)).toBe(true);
    expect(loserPath).toContain('.conflict-');
    const archived = JSON.parse(readFileSync(loserPath, 'utf8')) as SessionState;
    expect(archived.scratchpad).toBe('short scratchpad');
  });

  test('mergeWithBackup local wins when local.updatedAt > remote.updatedAt', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    const local = fixture({ sessionId: 'm', updatedAt: 200, scratchpad: 'local-newer' });
    const remote = fixture({ sessionId: 'm', updatedAt: 100, scratchpad: 'remote-older' });
    const { winner } = await sync.mergeWithBackup(local, remote);
    expect(winner.scratchpad).toBe('local-newer');
  });

  test('mergeWithBackup calls onConflictResolved callback', async () => {
    type Ev = { sessionId: string; winner: 'local' | 'remote'; loserPath: string };
    let captured: Ev | undefined;
    const sync = new SessionSync({
      storageDir: tmpDir,
      onConflictResolved: (e: Ev) => { captured = e; },
    });
    await sync.mergeWithBackup(
      fixture({ sessionId: 'c', updatedAt: 100 }),
      fixture({ sessionId: 'c', updatedAt: 200 }),
    );
    expect(captured).toBeDefined();
    expect(captured!.sessionId).toBe('c');
    expect(captured!.winner).toBe('remote');
  });

  test('mergeWithBackup rejects mismatched sessionId', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    await expect(
      sync.mergeWithBackup(fixture({ sessionId: 'a' }), fixture({ sessionId: 'b' })),
    ).rejects.toThrow(/sessionId mismatch/);
  });

  test('list returns session ids excluding conflict files', async () => {
    const sync = new SessionSync({ storageDir: tmpDir });
    await sync.save(fixture({ sessionId: 'a' }));
    await sync.save(fixture({ sessionId: 'b' }));
    await sync.mergeWithBackup(
      fixture({ sessionId: 'a', updatedAt: 100 }),
      fixture({ sessionId: 'a', updatedAt: 200 }),
    );
    const list = await sync.list();
    expect(list.sort()).toEqual(['a', 'b']);
    const files = readdirSync(tmpDir);
    expect(files.some((f) => f.includes('.conflict-'))).toBe(true);
  });

  test('list returns [] when storageDir missing', async () => {
    const sync = new SessionSync({ storageDir: join(tmpDir, 'no-such-dir') });
    expect(await sync.list()).toEqual([]);
  });
});
