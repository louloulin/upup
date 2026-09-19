# Sprint 1.3 Bridge-Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a local WebSocket bridge that lets remote clients (web/mobile, future Sprint 5) attach to a running UpUp agent. Sprint 1.3 ships a focused 5-file MVP per tasks.md 1.3.1-1.3.5 + 2 unit tests + CLI flag. End-to-end test (1.3.9) and docs (1.3.10) are deferred to Sprint 2.3 bridge-v2 when the full 34-file subsystem lands.

**Architecture:** Bun-native `Bun.serve({ websocket })` for the transport. Protocol: JSON-encoded 4 message kinds (chat/approval/output/status) per Design Doc D21. Auth: short-lived HMAC-SHA256 signed tokens (5-min refresh window) with per-IP rate limit and append-only audit log. Session: 1:1 mapping between a WS connection and a local CLI agent session. Client: minimal stdin/stdout proxy CLI.

**Tech Stack:** Bun runtime, TypeScript strict, `Bun.serve`, `node:crypto` for HMAC, `node:fs/promises` for audit log, no external deps.

**Reference (read-only):** `/Users/louloulin/Documents/linchong/claw/loucode/src/bridge/{types,jwtUtils,bridgeMain,replBridge,trustedDevice}.ts` (Sprint 2.3 will port the 34-file subsystem; Sprint 1.3 only borrows protocol design and security model).

---

## File Structure

```
src/bridge/
├── protocol.ts          # 4 message kinds + encode/decode/sign/verify
├── auth.ts              # HMAC token issue/verify + rate limit + audit log
├── session.ts           # BridgeSession: attach/start/handoff/shutdown
├── server.ts            # Bun WebSocket server wiring auth + protocol + sessions
├── client.ts            # CLI proxy: stdin/stdout <-> WS
├── protocol.test.ts     # encode/decode/sign/verify round-trip
└── server.test.ts       # token auth + rate limit + message routing
```

Plus one CLI entry change:
```
src/index.tsx            # Add --bridge / --bridge-port / --bridge-token / --bridge-bind flags
```

## Task 1: Protocol — 4 message kinds + serialize/deserialize + HMAC sign/verify

**Files:**
- Create: `src/bridge/protocol.ts`
- Create: `src/bridge/protocol.test.ts`

- [ ] **Step 1.1: Write failing tests for encode/decode/sign/verify**

Create `src/bridge/protocol.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  PROTOCOL_VERSION,
  decodeMessage,
  encodeMessage,
  signMessage,
  verifyMessage,
  type BridgeMessage,
} from './protocol.js';

const secret = 'test-secret-32-bytes-of-padded!!';

function makeChat(): BridgeMessage {
  return {
    kind: 'chat',
    seq: 1,
    sessionId: 'sess-1',
    timestamp: 1717480800000,
    payload: { role: 'user', content: '分析 600519' },
  };
}

describe('protocol', () => {
  test('PROTOCOL_VERSION is bridge.v1', () => {
    expect(PROTOCOL_VERSION).toBe('bridge.v1');
  });

  test('encode then decode round-trips chat message', () => {
    const msg = makeChat();
    const frame = encodeMessage(msg);
    const decoded = decodeMessage(frame);
    expect(decoded).toEqual(msg);
  });

  test('decode rejects malformed frame', () => {
    expect(() => decodeMessage(new Uint8Array([0, 1, 2]))).toThrow();
    expect(() => decodeMessage(new TextEncoder().encode('not json'))).toThrow();
  });

  test('sign + verify round-trip succeeds', () => {
    const msg = makeChat();
    const sig = signMessage(msg, secret);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyMessage(msg, sig, secret)).toBe(true);
  });

  test('verify fails with wrong secret', () => {
    const msg = makeChat();
    const sig = signMessage(msg, secret);
    expect(verifyMessage(msg, sig, 'wrong-secret')).toBe(false);
  });

  test('verify fails with tampered message', () => {
    const msg = makeChat();
    const sig = signMessage(msg, secret);
    const tampered: BridgeMessage = { ...msg, payload: { role: 'user', content: 'hacked' } };
    expect(verifyMessage(tampered, sig, secret)).toBe(false);
  });

  test('all 4 message kinds encode/decode', () => {
    const kinds: BridgeMessage[] = [
      { kind: 'chat', seq: 1, sessionId: 's', timestamp: 0, payload: { role: 'user', content: 'x' } },
      { kind: 'approval', seq: 2, sessionId: 's', timestamp: 0, payload: { tool: 'bash', args: { cmd: 'ls' }, approved: true } },
      { kind: 'output', seq: 3, sessionId: 's', timestamp: 0, payload: { tool: 'bash', result: 'file.txt', latencyMs: 12 } },
      { kind: 'status', seq: 4, sessionId: 's', timestamp: 0, payload: { phase: 'idle' } },
    ];
    for (const m of kinds) {
      const round = decodeMessage(encodeMessage(m));
      expect(round).toEqual(m);
    }
  });
});
```

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
bun test src/bridge/protocol.test.ts
```

Expected: `Cannot find module './protocol.js'`. Confirm failure before implementing.

- [ ] **Step 1.3: Implement `src/bridge/protocol.ts`**

```ts
// src/bridge/protocol.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PROTOCOL_VERSION = 'bridge.v1' as const;

export type BridgeMessage =
  | { kind: 'chat'; seq: number; sessionId: string; timestamp: number; payload: { role: 'user' | 'assistant'; content: string } }
  | { kind: 'approval'; seq: number; sessionId: string; timestamp: number; payload: { tool: string; args: unknown; approved: boolean } }
  | { kind: 'output'; seq: number; sessionId: string; timestamp: number; payload: { tool: string; result: string; latencyMs: number } }
  | { kind: 'status'; seq: number; sessionId: string; timestamp: number; payload: { phase: 'idle' | 'thinking' | 'tool' | 'done'; progress?: number } };

export function encodeMessage(msg: BridgeMessage): Uint8Array {
  // Envelope: { v: PROTOCOL_VERSION, msg }. Keeps room for future framing.
  return new TextEncoder().encode(JSON.stringify({ v: PROTOCOL_VERSION, msg }));
}

export function decodeMessage(frame: Uint8Array): BridgeMessage {
  let text: string;
  try {
    text = new TextDecoder().decode(frame);
  } catch {
    throw new Error('bridge.protocol: invalid utf-8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('bridge.protocol: invalid json');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { v?: unknown }).v !== PROTOCOL_VERSION ||
    !(parsed as { msg?: unknown }).msg ||
    typeof (parsed as { msg: unknown }).msg !== 'object'
  ) {
    throw new Error('bridge.protocol: bad envelope');
  }
  const msg = (parsed as { msg: BridgeMessage }).msg;
  if (!isBridgeMessage(msg)) {
    throw new Error('bridge.protocol: unknown message shape');
  }
  return msg;
}

function isBridgeMessage(v: unknown): v is BridgeMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (typeof m['seq'] !== 'number') return false;
  if (typeof m['sessionId'] !== 'string') return false;
  if (typeof m['timestamp'] !== 'number') return false;
  switch (m['kind']) {
    case 'chat': {
      const p = m['payload'] as { role?: unknown; content?: unknown };
      return (p.role === 'user' || p.role === 'assistant') && typeof p.content === 'string';
    }
    case 'approval': {
      const p = m['payload'] as { tool?: unknown; args?: unknown; approved?: unknown };
      return typeof p.tool === 'string' && typeof p.approved === 'boolean';
    }
    case 'output': {
      const p = m['payload'] as { tool?: unknown; result?: unknown; latencyMs?: unknown };
      return typeof p.tool === 'string' && typeof p.result === 'string' && typeof p.latencyMs === 'number';
    }
    case 'status': {
      const p = m['payload'] as { phase?: unknown };
      return p.phase === 'idle' || p.phase === 'thinking' || p.phase === 'tool' || p.phase === 'done';
    }
    default:
      return false;
  }
}

const SIGN_PREFIX = 'bridge.v1.hmac-sha256.';

export function signMessage(msg: BridgeMessage, secret: string): string {
  const body = JSON.stringify(msg);
  const mac = createHmac('sha256', secret).update(body).digest('hex');
  return SIGN_PREFIX + mac;
}

export function verifyMessage(msg: BridgeMessage, sig: string, secret: string): boolean {
  if (!sig.startsWith(SIGN_PREFIX)) return false;
  const provided = sig.slice(SIGN_PREFIX.length);
  const body = JSON.stringify(msg);
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

- [ ] **Step 1.4: Run tests — expect 7/7 pass**

```bash
bun test src/bridge/protocol.test.ts
```

- [ ] **Step 1.5: Commit**

```bash
git add src/bridge/protocol.ts src/bridge/protocol.test.ts
git commit -m "feat(bridge): Sprint 1.3 Task 1 — 4 类消息协议 + HMAC 签名"
```

## Task 2: Auth — HMAC token issue/verify + per-IP rate limit + audit log

**Files:**
- Create: `src/bridge/auth.ts`
- Create: `src/bridge/auth.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `src/bridge/auth.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BridgeAuth } from './auth.js';

let tmpDir: string;
let auditPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bridge-auth-'));
  auditPath = join(tmpDir, 'audit.log');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('BridgeAuth', () => {
  test('issueToken produces bearer string with 5min expiry', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath });
    const t = auth.issueToken('client-1');
    expect(t).toMatch(/^bridge\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const verified = auth.verifyToken(t);
    expect(verified.ok).toBe(true);
    expect(verified.clientId).toBe('client-1');
  });

  test('verifyToken rejects garbage', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath });
    expect(auth.verifyToken('nope').ok).toBe(false);
    expect(auth.verifyToken('a.b.c').ok).toBe(false);
  });

  test('verifyToken rejects wrong secret', () => {
    const a = new BridgeAuth({ secret: 'a', auditPath });
    const b = new BridgeAuth({ secret: 'b', auditPath });
    const t = a.issueToken('c1');
    expect(b.verifyToken(t).ok).toBe(false);
  });

  test('rateLimit allows up to 60 in window then blocks', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath, rateLimit: { windowMs: 60_000, max: 3 } });
    const ip = '127.0.0.1';
    expect(auth.rateLimit(ip).ok).toBe(true);
    expect(auth.rateLimit(ip).ok).toBe(true);
    expect(auth.rateLimit(ip).ok).toBe(true);
    const r = auth.rateLimit(ip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfter).toBeGreaterThan(0);
  });

  test('rateLimit buckets are per-IP', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath, rateLimit: { windowMs: 60_000, max: 1 } });
    expect(auth.rateLimit('1.1.1.1').ok).toBe(true);
    expect(auth.rateLimit('2.2.2.2').ok).toBe(true);
    expect(auth.rateLimit('1.1.1.1').ok).toBe(false);
  });

  test('audit log appends auth events', () => {
    const auth = new BridgeAuth({ secret: 's', auditPath });
    auth.issueToken('client-x');
    auth.verifyToken('bad-token');
    const text = readFileSync(auditPath, 'utf8');
    expect(text).toContain('issue');
    expect(text).toContain('client-x');
    expect(text).toContain('verify-fail');
  });
});
```

- [ ] **Step 2.2: Run test — expect module not found**

```bash
bun test src/bridge/auth.test.ts
```

- [ ] **Step 2.3: Implement `src/bridge/auth.ts`**

```ts
// src/bridge/auth.ts
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync } from 'node:fs';

export interface BridgeAuthConfig {
  secret: string;
  auditPath: string;
  tokenTtlMs?: number;          // default 5 min
  rateLimit?: { windowMs: number; max: number };
}

export type VerifyResult =
  | { ok: true; clientId: string; expiresAt: number }
  | { ok: false; reason: 'malformed' | 'expired' | 'bad-signature' };

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

interface Bucket {
  count: number;
  resetAt: number;
}

export class BridgeAuth {
  private readonly secret: string;
  private readonly auditPath: string;
  private readonly tokenTtlMs: number;
  private readonly rate: { windowMs: number; max: number };
  private readonly buckets = new Map<string, Bucket>();

  constructor(cfg: BridgeAuthConfig) {
    this.secret = cfg.secret;
    this.auditPath = cfg.auditPath;
    this.tokenTtlMs = cfg.tokenTtlMs ?? 5 * 60 * 1000;
    this.rate = cfg.rateLimit ?? { windowMs: 60_000, max: 60 };
  }

  issueToken(clientId: string): string {
    const expiresAt = Date.now() + this.tokenTtlMs;
    const payload = Buffer.from(JSON.stringify({ c: clientId, e: expiresAt, n: randomBytes(8).toString('hex') })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    this.audit('issue', { clientId, expiresAt });
    return `bridge.${payload}.${sig}`;
  }

  verifyToken(token: string): VerifyResult {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'bridge') {
      this.audit('verify-fail', { reason: 'malformed' });
      return { ok: false, reason: 'malformed' };
    }
    const [, payload, sig] = parts;
    const expected = createHmac('sha256', this.secret).update(payload).digest('base64url');
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      this.audit('verify-fail', { reason: 'bad-signature' });
      return { ok: false, reason: 'bad-signature' };
    }
    let parsed: { c?: unknown; e?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      this.audit('verify-fail', { reason: 'malformed' });
      return { ok: false, reason: 'malformed' };
    }
    if (typeof parsed.c !== 'string' || typeof parsed.e !== 'number') {
      this.audit('verify-fail', { reason: 'malformed' });
      return { ok: false, reason: 'malformed' };
    }
    if (Date.now() > parsed.e) {
      this.audit('verify-fail', { reason: 'expired' });
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, clientId: parsed.c, expiresAt: parsed.e };
  }

  rateLimit(ip: string): RateLimitResult {
    const now = Date.now();
    let b = this.buckets.get(ip);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + this.rate.windowMs };
      this.buckets.set(ip, b);
    }
    b.count += 1;
    if (b.count > this.rate.max) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
    }
    return { ok: true };
  }

  private audit(event: string, data: Record<string, unknown>): void {
    const line = JSON.stringify({ t: new Date().toISOString(), event, ...data }) + '\n';
    try {
      appendFileSync(this.auditPath, line);
    } catch {
      // best-effort; never throw from audit
    }
  }
}
```

- [ ] **Step 2.4: Run tests — expect 6/6 pass**

```bash
bun test src/bridge/auth.test.ts
```

- [ ] **Step 2.5: Commit**

```bash
git add src/bridge/auth.ts src/bridge/auth.test.ts
git commit -m "feat(bridge): Sprint 1.3 Task 2 — HMAC token + 速率限制 + 审计日志"
```

## Task 3: BridgeSession — attach / start / handoff / shutdown

**Files:**
- Create: `src/bridge/session.ts`
- Create: `src/bridge/session.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `src/bridge/session.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { BridgeSessionStore, type BridgeSession } from './session.js';

describe('BridgeSessionStore', () => {
  test('start creates session with unique id and idle status', () => {
    const store = new BridgeSessionStore();
    const s = store.start('client-a');
    expect(s.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.status).toBe('idle');
    expect(s.clientId).toBe('client-a');
  });

  test('attach returns existing session by id', () => {
    const store = new BridgeSessionStore();
    const a = store.start('client-a');
    const b = store.attach(a.id, 'client-b');
    expect(b?.id).toBe(a.id);
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
    expect(fetched?.history.length).toBe(1);
  });

  test('handoff transfers clientId but keeps history', () => {
    const store = new BridgeSessionStore();
    const a = store.start('client-a');
    store.update(a.id, { status: 'thinking' });
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
});
```

- [ ] **Step 3.2: Run — expect module not found**

```bash
bun test src/bridge/session.test.ts
```

- [ ] **Step 3.3: Implement `src/bridge/session.ts`**

```ts
// src/bridge/session.ts
import { randomBytes } from 'node:crypto';

export type SessionStatus = 'idle' | 'thinking' | 'tool' | 'done';

export interface BridgeSession {
  id: string;
  clientId: string;
  status: SessionStatus;
  history: Array<{ kind: string; payload: unknown; at: number }>;
  createdAt: number;
  updatedAt: number;
}

export class BridgeSessionStore {
  private readonly byId = new Map<string, BridgeSession>();

  start(clientId: string): BridgeSession {
    const now = Date.now();
    const s: BridgeSession = {
      id: randomBytes(12).toString('base64url'),
      clientId,
      status: 'idle',
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(s.id, s);
    return s;
  }

  attach(id: string, clientId: string): BridgeSession | null {
    const s = this.byId.get(id);
    if (!s) return null;
    s.clientId = clientId;
    s.updatedAt = Date.now();
    return s;
  }

  handoff(id: string, newClientId: string): BridgeSession | null {
    const s = this.byId.get(id);
    if (!s) return null;
    s.clientId = newClientId;
    s.status = 'idle';
    s.updatedAt = Date.now();
    return s;
  }

  get(id: string): BridgeSession | undefined {
    return this.byId.get(id);
  }

  update(id: string, patch: Partial<Pick<BridgeSession, 'status'>>): BridgeSession | null {
    const s = this.byId.get(id);
    if (!s) return null;
    if (patch.status) s.status = patch.status;
    s.updatedAt = Date.now();
    return s;
  }

  recordEvent(id: string, kind: string, payload: unknown): void {
    const s = this.byId.get(id);
    if (!s) return;
    s.history.push({ kind, payload, at: Date.now() });
    s.updatedAt = Date.now();
  }

  shutdown(id: string): void {
    this.byId.delete(id);
  }

  list(): BridgeSession[] {
    return [...this.byId.values()];
  }
}
```

- [ ] **Step 3.4: Run tests — expect 6/6 pass**

```bash
bun test src/bridge/session.test.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add src/bridge/session.ts src/bridge/session.test.ts
git commit -m "feat(bridge): Sprint 1.3 Task 3 — BridgeSessionStore 接入/移交/关停"
```

## Task 4: Server — Bun WebSocket wiring auth + protocol + session

**Files:**
- Create: `src/bridge/server.ts`
- Create: `src/bridge/server.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `src/bridge/server.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBridgeServer, type BridgeServer } from './server.js';
import { encodeMessage, type BridgeMessage } from './protocol.js';

let tmpDir: string;
let auditPath: string;
let server: BridgeServer | null = null;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'bridge-srv-'));
  auditPath = join(tmpDir, 'audit.log');
});

afterEach(async () => {
  if (server) {
    await server.stop();
    server = null;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

async function startWithToken(token: string): Promise<{ server: BridgeServer; port: number }> {
  const srv = await startBridgeServer({ port: 0, token, auditPath });
  server = srv;
  return { server: srv, port: srv.port };
}

describe('startBridgeServer', () => {
  test('starts on a free port and accepts authenticated WS', async () => {
    const token = 'secret-aaa';
    const { port } = await startWithToken(token);
    expect(port).toBeGreaterThan(0);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge?token=${encodeURIComponent(token)}`);
    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });
    expect(opened).toBe(true);
    ws.close();
  });

  test('rejects connection without token (4401)', async () => {
    const { port } = await startWithToken('secret-bbb');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    const code = await new Promise<number>((resolve) => {
      ws.onclose = (e) => resolve(e.code);
      ws.onerror = () => resolve(-1);
    });
    expect(code).toBe(4401);
  });

  test('echoes status message back after chat', async () => {
    const token = 'secret-ccc';
    const { port } = await startWithToken(token);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge?token=${encodeURIComponent(token)}`);
    await new Promise<void>((res) => (ws.onopen = () => res()));
    const chat: BridgeMessage = {
      kind: 'chat', seq: 1, sessionId: 's1', timestamp: Date.now(),
      payload: { role: 'user', content: 'hi' },
    };
    ws.send(encodeMessage(chat));
    const reply = await new Promise<BridgeMessage>((res, rej) => {
      ws.onmessage = (e) => {
        try { res(JSON.parse(new TextDecoder().decode(e.data as ArrayBuffer)).msg); }
        catch { rej(new Error('bad frame')); }
      };
      setTimeout(() => rej(new Error('timeout')), 2000);
    });
    expect(reply.kind).toBe('status');
    ws.close();
  });

  test('writes audit log on connect + chat', async () => {
    const token = 'secret-ddd';
    const { port } = await startWithToken(token);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge?token=${encodeURIComponent(token)}`);
    await new Promise<void>((res) => (ws.onopen = () => res()));
    const chat: BridgeMessage = {
      kind: 'chat', seq: 1, sessionId: 's1', timestamp: Date.now(),
      payload: { role: 'user', content: 'audit me' },
    };
    ws.send(encodeMessage(chat));
    await new Promise<void>((res) => {
      ws.onmessage = () => res();
      setTimeout(res, 2000);
    });
    ws.close();
    await new Promise((res) => setTimeout(res, 50));
    const text = readFileSync(auditPath, 'utf8');
    expect(text).toContain('connect');
    expect(text).toContain('chat');
  });
});
```

- [ ] **Step 4.2: Run — expect module not found**

```bash
bun test src/bridge/server.test.ts
```

- [ ] **Step 4.3: Implement `src/bridge/server.ts`**

```ts
// src/bridge/server.ts
import { BridgeAuth } from './auth.js';
import { BridgeSessionStore } from './session.js';
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol.js';
import { appendFileSync } from 'node:fs';

export interface BridgeServerConfig {
  port: number;             // 0 = OS-assigned free port
  bind?: string;            // default 127.0.0.1
  token: string;
  auditPath: string;
}

export interface BridgeServer {
  port: number;
  stop(): Promise<void>;
}

interface ConnState {
  clientId: string;
  sessionId: string;
  ip: string;
}

export async function startBridgeServer(cfg: BridgeServerConfig): Promise<BridgeServer> {
  const auth = new BridgeAuth({ secret: cfg.token, auditPath: cfg.auditPath });
  const sessions = new BridgeSessionStore();
  const bind = cfg.bind ?? '127.0.0.1';

  const bunServer = Bun.serve({
    port: cfg.port,
    hostname: bind,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname !== '/bridge') {
        return new Response('Not found', { status: 404 });
      }
      const token = url.searchParams.get('token');
      if (!token) {
        audit(cfg.auditPath, 'reject', { reason: 'no-token' });
        // Browsers won't see non-101 status; reject via upgrade failure -> close 4401
        return new Response('Token required', { status: 401 });
      }
      const v = auth.verifyToken(token);
      if (!v.ok) {
        audit(cfg.auditPath, 'reject', { reason: v.reason });
        return new Response('Unauthorized', { status: 401 });
      }
      // The token authenticates the URL; per-connection clientId is the token subject.
      const clientId = v.clientId;
      const ip = srv.requestIP(req)?.address ?? 'unknown';
      const upgraded = srv.upgrade(req, {
        data: { clientId, sessionId: '', ip } satisfies ConnState,
      });
      if (upgraded) return undefined;
      return new Response('Upgrade failed', { status: 500 });
    },
    websocket: {
      open(ws) {
        const data = ws.data as ConnState;
        const session = sessions.start(data.clientId);
        data.sessionId = session.id;
        audit(cfg.auditPath, 'connect', { clientId: data.clientId, sessionId: session.id, ip: data.ip });
        const status: BridgeMessage = {
          kind: 'status', seq: 0, sessionId: session.id, timestamp: Date.now(),
          payload: { phase: 'idle' },
        };
        try { ws.send(encodeMessage(status)); } catch {}
      },
      message(ws, raw) {
        const data = ws.data as ConnState;
        const rl = auth.rateLimit(data.ip);
        if (!rl.ok) {
          const err: BridgeMessage = {
            kind: 'status', seq: 0, sessionId: data.sessionId, timestamp: Date.now(),
            payload: { phase: 'idle' },
          };
          audit(cfg.auditPath, 'rate-limited', { ip: data.ip, retryAfter: rl.retryAfter });
          try { ws.send(encodeMessage(err)); } catch {}
          return;
        }
        let msg: BridgeMessage;
        try { msg = decodeMessage(raw as Uint8Array); }
        catch (e) { audit(cfg.auditPath, 'decode-fail', { err: (e as Error).message }); return; }
        sessions.recordEvent(data.sessionId, msg.kind, msg.payload);
        audit(cfg.auditPath, msg.kind, { sessionId: data.sessionId, seq: msg.seq });
        // MVP behavior: respond with status=thinking then immediately status=idle.
        // Sprint 2.3 wires real agent loop here.
        const thinking: BridgeMessage = {
          kind: 'status', seq: msg.seq, sessionId: data.sessionId, timestamp: Date.now(),
          payload: { phase: 'thinking' },
        };
        const idle: BridgeMessage = {
          kind: 'status', seq: msg.seq, sessionId: data.sessionId, timestamp: Date.now() + 1,
          payload: { phase: 'idle' },
        };
        try {
          ws.send(encodeMessage(thinking));
          ws.send(encodeMessage(idle));
        } catch {}
      },
      close(ws) {
        const data = ws.data as ConnState;
        if (data.sessionId) sessions.shutdown(data.sessionId);
        audit(cfg.auditPath, 'disconnect', { clientId: data.clientId, sessionId: data.sessionId });
      },
    },
  });

  return {
    port: bunServer.port,
    async stop() { await bunServer.stop(); },
  };
}

function audit(path: string, event: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data }) + '\n';
  try { appendFileSync(path, line); } catch {}
}
```

- [ ] **Step 4.4: Run tests — expect 4/4 pass**

```bash
bun test src/bridge/server.test.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add src/bridge/server.ts src/bridge/server.test.ts
git commit -m "feat(bridge): Sprint 1.3 Task 4 — Bun WebSocket server 接线 auth + session"
```

## Task 5: Client — minimal CLI proxy over WebSocket

**Files:**
- Create: `src/bridge/client.ts`

(No dedicated client unit test in Sprint 1.3; coverage comes from server.test.ts + the e2e deferred to Sprint 2.3.)

- [ ] **Step 5.1: Implement `src/bridge/client.ts`**

```ts
// src/bridge/client.ts
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol.js';

export interface BridgeClientOptions {
  url: string;          // ws://host:port/bridge?token=...
  input?: NodeJS.ReadableStream;  // default: process.stdin
  output?: NodeJS.WritableStream; // default: process.stdout
}

export interface BridgeClient {
  close(): void;
}

export function startBridgeClient(opts: BridgeClientOptions): BridgeClient {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  const ws = new WebSocket(opts.url);
  let seq = 0;
  let sessionId = '';

  ws.addEventListener('open', () => {
    output.write('[bridge] connected\n');
  });
  ws.addEventListener('close', () => {
    output.write('[bridge] disconnected\n');
  });
  ws.addEventListener('error', () => {
    output.write('[bridge] connection error\n');
  });
  ws.addEventListener('message', (ev) => {
    try {
      const msg = decodeMessage(new Uint8Array(ev.data as ArrayBuffer));
      if (msg.kind === 'status') {
        sessionId = msg.sessionId;
        output.write(`[bridge] status=${msg.payload.phase} session=${msg.sessionId}\n`);
      } else if (msg.kind === 'output') {
        output.write(`[bridge] output tool=${msg.payload.tool} result=${msg.payload.result}\n`);
      } else if (msg.kind === 'chat') {
        output.write(`[bridge] echo: ${msg.payload.content}\n`);
      } else if (msg.kind === 'approval') {
        output.write(`[bridge] approval approved=${msg.payload.approved}\n`);
      }
    } catch (e) {
      output.write(`[bridge] decode error: ${(e as Error).message}\n`);
    }
  });

  let buffer = '';
  input.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        seq += 1;
        const msg: BridgeMessage = {
          kind: 'chat', seq, sessionId, timestamp: Date.now(),
          payload: { role: 'user', content: line },
        };
        try { ws.send(encodeMessage(msg)); } catch {}
      }
      nl = buffer.indexOf('\n');
    }
  });

  return {
    close() { try { ws.close(); } catch {} },
  };
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/bridge/client.ts
git commit -m "feat(bridge): Sprint 1.3 Task 5 — CLI 代理客户端(stdin/stdout <-> WS)"
```

## Task 6: CLI flag — `--bridge` / `--bridge-port` / `--bridge-token` / `--bridge-bind`

**Files:**
- Modify: `src/index.tsx`

- [ ] **Step 6.1: Add bridge flags + dispatch before runCli**

Append at top of `src/index.tsx` (after the existing `getFlag` / `hasFlag` helpers), add a new block right before the `switch (command)`:

```ts
// Bridge-mode flag (Sprint 1.3). When present, start WebSocket bridge alongside CLI.
if (hasFlag(['--bridge'])) {
  const { startBridgeServer } = await import('./bridge/server.js');
  const portRaw = getFlag(['--bridge-port']) ?? '7333';
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    console.error(`Invalid --bridge-port: ${portRaw}`);
    process.exit(1);
  }
  const bind = getFlag(['--bridge-bind']) ?? '127.0.0.1';
  const explicitToken = getFlag(['--bridge-token']);
  const token = explicitToken && explicitToken.length >= 8
    ? explicitToken
    : crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  const auditPath = join(homedir(), '.upup', 'bridge-audit.log');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dirname(auditPath), { recursive: true });
  const srv = await startBridgeServer({ port, bind, token, auditPath });
  console.log(`[bridge] listening on ws://${bind}:${srv.port}/bridge?token=${token}`);
  // Bridge-only mode: keep process alive without launching CLI.
  if (hasFlag(['--bridge-only'])) {
    await new Promise(() => {});
    return;
  }
  // Otherwise continue into the normal CLI flow below.
}
```

Add the required imports near the top of the file:

```ts
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
```

And extend the `printHelp()` function to include the bridge section:

```ts
  upup --bridge [--bridge-port=7333] [--bridge-token=<secret>] [--bridge-bind=127.0.0.1] [--bridge-only]
         Start CLI with local WebSocket bridge enabled (token auto-generated if omitted)

```

- [ ] **Step 6.2: Typecheck + smoke test the new flag**

```bash
bun run typecheck
# Smoke: start with random port + auto token, hit it, kill
bun run src/index.tsx --bridge --bridge-port 0 --bridge-only &
PID=$!
sleep 1
kill $PID 2>/dev/null
wait $PID 2>/dev/null
```

Expected: `bun run typecheck` exits 0, smoke test prints `[bridge] listening on ws://...` then is killed.

- [ ] **Step 6.3: Run all bridge tests + full suite**

```bash
bun test src/bridge/
bun test                     # ensure no regression
bun run typecheck
```

- [ ] **Step 6.4: Commit**

```bash
git add src/index.tsx
git commit -m "feat(bridge): Sprint 1.3 Task 6 — --bridge CLI flag 集成"
```

## Task 7: Wire `formatToolResult` envelope (if a tool will be registered)

> **Skipped in Sprint 1.3.** Bridge is transport + auth + session only; it does not yet expose a tool to the LangChain agent. The `formatToolResult` envelope is added when Sprint 2.3 bridge-v2 ports the 34-file subsystem and registers bridge tools via `src/tools/registry/`. Defer.

## Task 8: Update tasks.md + push upstream

- [ ] **Step 8.1: Mark Sprint 1.3 tasks complete in `openspec/changes/top-tier-investment-assistant-v2/tasks.md`**

Replace the 1.3 block:

```
### 1.3 bridge-mode

- [x] 1.3.1 实现 `src/bridge/server.ts` 本地 WebSocket server(`Bun.serve({ websocket })`)
- [x] 1.3.2 实现 `src/bridge/protocol.ts` 消息协议(chat/approval/output/status 4 类)
- [x] 1.3.3 实现 `src/bridge/auth.ts` token 鉴权 + 速率限制 + 审计日志
- [x] 1.3.4 实现 `src/bridge/session.ts` 远端 session 接入 + 跨设备
- [x] 1.3.5 实现 `src/bridge/client.ts` 基础 CLI 客户端
- [x] 1.3.6 写 `src/bridge/server.test.ts` 验证 token 鉴权 + 消息路由
- [x] 1.3.7 写 `src/bridge/protocol.test.ts` 验证消息序列化
- [x] 1.3.8 CLI 参数 `upup --bridge --bridge-token=<secret>` 启动
- [ ] 1.3.9 [deferred → Sprint 2.3] e2e:启动 bridge,CLI 客户端连接、发送消息、批准权限
- [ ] 1.3.10 [deferred → Sprint 2.3] 写 `docs/bridge.md` 使用文档
```

- [ ] **Step 8.2: Commit**

```bash
git add openspec/changes/top-tier-investment-assistant-v2/tasks.md
git commit -m "chore(tasks): mark Sprint 1.3 bridge-mode tasks complete (8/10, 2 deferred to Sprint 2.3)"
```

- [ ] **Step 8.3: Push to upstream (gitcode) — GitHub origin is blocked by network**

```bash
git push upstream main
```

## Deferred to Sprint 2.3 (bridge-v2)

- 1.3.9 E2E: full bridge flow (start server → WS client connect → chat → status → audit)
- 1.3.10 `docs/bridge.md`: usage docs
- Full 34-file subsystem port from loucode (`bridgeApi`, `bridgeMessaging`, `peerSessions`, `trustedDevice`, etc.)
- Web/mobile React client (Design Doc D12 Q1)
