import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { startBridgeServer, type BridgeServer } from './server.js';
import { encodeMessage, type BridgeMessage } from './protocol.js';
import { SessionSync } from './session-sync.js';

async function frameToMessage(event: MessageEvent): Promise<BridgeMessage> {
  const data = event.data as unknown;
  const bytes = data instanceof Blob
    ? new Uint8Array(await data.arrayBuffer())
    : typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data as ArrayBuffer);
  return JSON.parse(new TextDecoder().decode(bytes)).msg as BridgeMessage;
}

function nextMessage(ws: WebSocket, timeoutMs = 3000): Promise<BridgeMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bridge message timeout')), timeoutMs);
    ws.onmessage = async (event) => {
      clearTimeout(timer);
      resolve(await frameToMessage(event));
    };
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('bridge websocket failed'));
  });
}

describe('Bridge Pi execution contract', () => {
  test('executes user chat through the injected Pi-backed runner and persists assistant output', async () => {
    const root = await mkdtemp(join(process.cwd(), '.upup', 'bridge-pi-contract-'));
    const sync = new SessionSync({ storageDir: root });
    const auditPath = join(root, 'audit.log');
    const calls: string[] = [];
    let server: BridgeServer | undefined;
    let ws: WebSocket | undefined;
    try {
      server = await startBridgeServer({
        port: 0,
        token: 'bridge-fixture-token',
        auditPath,
        sessionSync: sync,
        agentRunner: async (request) => {
          calls.push(request.query);
          await request.onEvent?.({ type: 'stream_progress', charDelta: 7, mode: 'responding', textContent: 'fixture' });
          return 'Pi bridge answer';
        },
      });
      ws = new WebSocket(`ws://127.0.0.1:${server.port}/bridge?token=bridge-fixture-token`);
      await waitOpen(ws);
      const initial = await nextMessage(ws);
      expect(initial.kind).toBe('status');
      const sessionId = initial.sessionId;
      const chat: BridgeMessage = {
        kind: 'chat',
        seq: 1,
        sessionId,
        timestamp: Date.now(),
        payload: { role: 'user', content: '分析 600519' },
      };
      ws.send(encodeMessage(chat));
      const thinking = await nextMessage(ws);
      expect(thinking.payload).toEqual({ phase: 'thinking' });
      const assistant = await nextMessage(ws);
      expect(assistant.kind).toBe('chat');
      expect(assistant.payload).toEqual({ role: 'assistant', content: 'Pi bridge answer' });
      const done = await nextMessage(ws);
      expect(done.payload).toEqual({ phase: 'done' });
      const idle = await nextMessage(ws);
      expect(idle.payload).toEqual({ phase: 'idle' });
      expect(calls).toEqual(['分析 600519']);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const persisted = await sync.load(sessionId);
      expect(persisted?.history.some((entry) => entry.kind === 'chat' && (entry.payload as { role?: string }).role === 'assistant')).toBe(true);
      expect(await readFile(auditPath, 'utf8')).toContain('"event":"chat"');
    } finally {
      ws?.close();
      await server?.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});
