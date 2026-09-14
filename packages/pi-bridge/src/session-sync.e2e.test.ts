// E2E tests for cross-device session-sync.
// Covers 3 flows:
//   1. local CLI persists snapshot -> remote WS attaches via ?sessionId=
//      and continues; the follow-up chat is recorded into the snapshot.
//   2. concurrent edits to the same session -> last-writer-wins + loser
//      archived to <id>.conflict-<ts>.json.
//   3. list() returns only "live" session files (no .conflict-* entries).
//
// Note on WS handshake timing: test 1 uses a real Bun WS handshake
// against a fresh Bun.serve({port:0}). In bun:test 1.3.7, the
// afterEach's bunServer.stop() hangs unless the WS is fully closed
// before the test body returns. The fix is the same pattern used by
// server.test.ts's audit log test: ws.close() then a 100ms settle
// before exiting. Without it, the test reports a 5s hook timeout
// even though the WS actually opened and the body finished.

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGatewayConfigRuntime } from '@upup/gateway';
import { resetPiRuntimePorts } from '@upup/pi-runtime';
import { startBridgeServer, type BridgeServer } from './server.js';
import { SessionSync, type SessionState } from './session-sync.js';
import { encodeMessage, type BridgeMessage } from './protocol.js';

let tmpDir: string;
let auditPath: string;
let storageDir: string;
let server: BridgeServer | null = null;
let trackedWs: WebSocket | null = null;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'e2e-sync-'));
  storageDir = join(tmpDir, 'sessions');
  auditPath = join(tmpDir, 'audit.log');
  registerGatewayConfigRuntime({
    getConfiguredModelId: () => 'bridge-e2e-fixture-model',
    getConfiguredProvider: () => 'upup-bridge-e2e-fixture',
  });
});

afterEach(async () => {
  if (trackedWs) {
    try { trackedWs.close(); } catch { /* best-effort */ }
    trackedWs = null;
  }
  if (server) {
    try { await server.stop(); } catch { /* best-effort */ }
    server = null;
  }
  rmSync(tmpDir, { recursive: true, force: true });
  resetPiRuntimePorts();
});

function openWs(port: number, query: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/bridge${query}`);
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((res, rej) => {
    let settled = false;
    const fail = (m: string): void => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      rej(new Error(m));
    };
    ws.onopen = () => {
      if (settled) return;
      settled = true;
      res();
    };
    ws.onerror = () => fail('ws open failed');
    setTimeout(() => fail('ws open timeout'), 3000);
  });
}

async function readFrame(e: MessageEvent): Promise<ArrayBuffer> {
  const data = e.data as unknown;
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Blob) return await data.arrayBuffer();
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).buffer as ArrayBuffer;
  }
  if (data instanceof Uint8Array) {
    const ab = new ArrayBuffer(data.byteLength);
    new Uint8Array(ab).set(data);
    return ab;
  }
  throw new Error(`unsupported ws data type`);
}

function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<BridgeMessage> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('ws message timeout')), timeoutMs);
    ws.onmessage = async (e) => {
      clearTimeout(t);
      try {
        const buf = await readFrame(e);
        const env = JSON.parse(new TextDecoder().decode(buf));
        res(env.msg as BridgeMessage);
      } catch (err) {
        rej(err as Error);
      }
    };
  });
}

const TOKEN = 'e2e-token-1234567890';

describe('session-sync e2e', () => {
  test.serial('local serialize -> remote resume -> follow-up chat persists', async () => {
    // 1. Local CLI creates a session and persists it.
    const sync = new SessionSync({ storageDir });
    const local: SessionState = {
      sessionId: 's-loc-1',
      createdAt: 1000,
      updatedAt: 1000,
      clientId: 'cli-local',
      status: 'idle',
      history: [
        { kind: 'chat', payload: { content: 'analyze 600519' }, at: 1000 },
        { kind: 'output', payload: { result: 'OK' }, at: 1500 },
      ],
      messages: [
        { role: 'user', content: 'analyze 600519', at: 1000 },
      ],
      toolHistory: [
        { tool: 'finance_search', args: { symbol: '600519' }, result: '{"price":1700}', at: 1200 },
      ],
      scratchpad: 'first analysis',
      featureGates: {},
      metadata: {},
    };
    await sync.save(local);

    // 2. Start bridge server with the same sync.
    const srv = await startBridgeServer({
      port: 0,
      token: TOKEN,
      auditPath,
      sessionSync: sync,
    });
    server = srv;

    // 3. Remote client opens WS with the local sessionId, sends a follow-up chat.
    const ws = openWs(srv.port, `?token=${TOKEN}&sessionId=s-loc-1`);
    trackedWs = ws;
    await waitOpen(ws);
    await nextMessage(ws); // initial status (attached to existing snapshot)
    const follow: BridgeMessage = {
      kind: 'chat',
      seq: 1,
      sessionId: 's-loc-1',
      timestamp: 2000,
      payload: { role: 'user', content: 'follow-up' },
    };
    ws.send(encodeMessage(follow));
    const thinking = await nextMessage(ws);
    expect(thinking.kind).toBe('status');
    expect((thinking.payload as { phase: string }).phase).toBe('thinking');
    await nextMessage(ws); // idle

    // Give the fire-and-forget persistAfterMessage a moment to land.
    await new Promise((r) => setTimeout(r, 100));
    // Bun 1.3.7: bunServer.stop() in afterEach hangs if the WS isn't
    // fully closed. Same pattern as server.test.ts audit log test.
    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // 4. Local side reads back the snapshot — the follow-up chat should
    //    have been appended to history.
    const updated = await sync.load('s-loc-1');
    expect(updated).not.toBeNull();
    const chats = updated!.history.filter((h) => h.kind === 'chat');
    expect(chats.length).toBeGreaterThanOrEqual(2);
    expect(
      chats.some(
        (h) => (h.payload as { content: string }).content === 'follow-up',
      ),
    ).toBe(true);
    // Persisted extras (messages, toolHistory, scratchpad) survive the merge.
    expect(updated!.scratchpad).toBe('first analysis');
    expect(updated!.messages).toHaveLength(1);
    expect(updated!.toolHistory).toHaveLength(1);
  });

  test.serial('concurrent edits produce .conflict-<ts>.json archive and winner', async () => {
    const sync = new SessionSync({ storageDir });
    const base: SessionState = {
      sessionId: 's-conflict',
      createdAt: 1000,
      updatedAt: 1000,
      clientId: 'a',
      status: 'idle',
      history: [],
      messages: [],
      toolHistory: [],
      scratchpad: 'base',
      featureGates: {},
      metadata: {},
    };
    await sync.save(base);

    const local: SessionState = { ...base, updatedAt: 2000, scratchpad: 'local-edit' };
    const remote: SessionState = { ...base, updatedAt: 1500, scratchpad: 'remote-edit' };
    const { winner, loserPath } = await sync.mergeWithBackup(local, remote);

    // local has later updatedAt -> wins
    expect(winner.scratchpad).toBe('local-edit');
    expect(existsSync(loserPath)).toBe(true);
    expect(loserPath).toContain('.conflict-');
    const archived = JSON.parse(readFileSync(loserPath, 'utf8')) as SessionState;
    expect(archived.scratchpad).toBe('remote-edit');
  });

  test.serial('list excludes conflict files', async () => {
    const sync = new SessionSync({ storageDir });
    const base = (id: string, ts: number): SessionState => ({
      sessionId: id,
      createdAt: ts,
      updatedAt: ts,
      clientId: 'c',
      status: 'idle',
      history: [],
      messages: [],
      toolHistory: [],
      scratchpad: '',
      featureGates: {},
      metadata: {},
    });
    await sync.save(base('one', 1));
    await sync.save(base('two', 1));
    await sync.mergeWithBackup(
      base('one', 100),
      base('one', 200),
    );
    const ids = await sync.list();
    expect(ids.sort()).toEqual(['one', 'two']);
    const files = readdirSync(storageDir);
    expect(files.some((f) => f.includes('.conflict-'))).toBe(true);
  });
});
