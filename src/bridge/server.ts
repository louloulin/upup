import { BridgeAuth } from './auth.js';
import { BridgeSessionStore } from './session.js';
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol.js';
import { DossierStore } from '../memory/dossier.js';
import { SessionSync, type SessionState } from './session-sync.js';
import { appendFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BridgeServerConfig {
  port: number;
  bind?: string;
  token: string;
  auditPath: string;
  /**
   * Cross-device session persistence. If omitted, defaults to
   * ~/.upup/sessions (overridable via `sessionStorageDir` for tests).
   */
  sessionSync?: SessionSync;
  /** Override the default session storage directory. */
  sessionStorageDir?: string;
  /**
   * Optional dossier store (P2.b.2). When provided, the
   * `GET /bridge/snapshot/dossier/{ticker}` endpoint becomes readable.
   * If omitted, the dossier snapshot endpoint returns 503 (the WS path
   * is unaffected).
   */
  dossiers?: DossierStore;
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
  const sync =
    cfg.sessionSync ??
    new SessionSync({
      storageDir: cfg.sessionStorageDir ?? join(homedir(), '.upup', 'sessions'),
    });
  const bind = cfg.bind ?? '127.0.0.1';

  // P2.b.2: snapshot endpoints need the *actual* bound port (cfg.port
  // is 0 when the caller asked for an ephemeral one). Explicit type
  // annotation breaks the self-reference cycle with the fetch closure
  // that reads bunServer.port.
  const bunServer: ReturnType<typeof Bun.serve> = Bun.serve({
    port: cfg.port,
    hostname: bind,
    async fetch(req, srv) {
      const url = new URL(req.url);
      // P2.b.2: read-only JSON snapshot endpoints (C3 Web UI). The health
      // check is unauthenticated; snapshot/* requires the same token as
      // the WS endpoint. These exist to give the future Vite+React UI a
      // hermetic data surface (no direct imports of business modules).
      if (req.method === 'GET' && url.pathname === '/bridge/health') {
        return new Response(
          JSON.stringify({ ok: true, ts: Date.now(), port: srv.port ?? 0, version: '0.0.0' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.pathname.startsWith('/bridge/snapshot/')) {
        // Non-GET methods enter the router so it can return 405 explicitly
        // (per REST conventions) rather than 404 from the catch-all below.
        return handleSnapshot(url, req, cfg, sync, auth);
      }
      if (url.pathname !== '/bridge') {
        return new Response('Not found', { status: 404 });
      }
      const token = url.searchParams.get('token');
      if (!token) {
        audit(cfg.auditPath, 'reject', { reason: 'no-token' });
        return new Response('Token required', { status: 401 });
      }
      const v = auth.verifyToken(token);
      let clientId: string;
      if (v.ok) {
        clientId = v.clientId;
      } else {
        // Fallback: accept raw secret for dev / CLI ergonomics. Production should
        // always use bridge.xxx.yyy format tokens (issueToken()).
        const tk = Buffer.from(token);
        const sk = Buffer.from(cfg.token);
        if (tk.length === sk.length && tk.length >= 8) {
          try {
            if (timingSafeEqual(tk, sk)) {
              clientId = 'shared-secret';
            } else {
              audit(cfg.auditPath, 'reject', { reason: v.reason });
              return new Response('Unauthorized', { status: 401 });
            }
          } catch {
            audit(cfg.auditPath, 'reject', { reason: v.reason });
            return new Response('Unauthorized', { status: 401 });
          }
        } else {
          audit(cfg.auditPath, 'reject', { reason: v.reason });
          return new Response('Unauthorized', { status: 401 });
        }
      }
      const ip = srv.requestIP(req)?.address ?? 'unknown';
      // Optional ?sessionId=<id>: cross-device resume. The session must
      // already exist on disk (we don't accept forged ids here).
      let resumeSessionId = '';
      const requestedId = url.searchParams.get('sessionId');
      if (requestedId) {
        const persisted = await sync.load(requestedId);
        if (!persisted) {
          audit(cfg.auditPath, 'reject', {
            reason: 'unknown-sessionId',
            sessionId: requestedId,
          });
          return new Response('Unknown sessionId', { status: 400 });
        }
        resumeSessionId = requestedId;
      }
      const upgraded = srv.upgrade(req, {
        data: { clientId, sessionId: resumeSessionId, ip },
      });
      if (upgraded) return undefined;
      return new Response('Upgrade failed', { status: 500 });
    },
    websocket: {
      // Type-narrow ws.data to ConnState. The fetch() handler passes the
      // ConnState via server.upgrade(req, { data: ... }) and Bun re-exposes
      // it on ws.data in the lifecycle callbacks.
      data: {} as ConnState,
      open(ws) {
        const data = ws.data;
        if (data.sessionId) {
          // Cross-device resume: the fetch handler already validated that
          // the snapshot exists on disk. Join (or attach to) the in-memory
          // store under that id, then rehydrate history from the snapshot.
          const session = sessions.join(data.sessionId, data.clientId);
          // Rehydrate history in the background so the handshake isn't
          // blocked on disk I/O. recordEvent later appends to this list.
          void sync.load(data.sessionId).then((persisted) => {
            if (persisted && session.history.length === 0) {
              session.history = [...persisted.history];
            }
          }).catch(() => { /* best-effort */ });
        } else {
          const session = sessions.start(data.clientId);
          data.sessionId = session.id;
        }
        const finalSessionId = data.sessionId;
        audit(cfg.auditPath, 'connect', {
          clientId: data.clientId,
          sessionId: finalSessionId,
          ip: data.ip,
        });
        const status: BridgeMessage = {
          kind: 'status',
          seq: 0,
          sessionId: finalSessionId,
          timestamp: Date.now(),
          payload: { phase: 'idle' },
        };
        try {
          ws.send(encodeMessage(status));
        } catch {
          // best-effort
        }
      },
      message(ws, raw) {
        const data = ws.data;
        const rl = auth.rateLimit(data.ip);
        if (!rl.ok) {
          audit(cfg.auditPath, 'rate-limited', {
            ip: data.ip,
            retryAfter: rl.retryAfter,
          });
          return;
        }
        let msg: BridgeMessage;
        try {
          msg = decodeMessage(raw as Uint8Array);
        } catch (e) {
          audit(cfg.auditPath, 'decode-fail', { err: (e as Error).message });
          return;
        }
        // Late session-id binding: if the chat carries a sessionId that
        // differs from the one we opened with, try to attach to the
        // persisted snapshot. If not on disk yet, adopt the message's id
        // so future saves land under the right file. Fire-and-forget so
        // the response loop isn't blocked on disk I/O.
        if (msg.sessionId && msg.sessionId !== data.sessionId) {
          adoptMessageSessionId(sync, sessions, data, msg.sessionId);
        }
        sessions.recordEvent(data.sessionId, msg.kind, msg.payload);
        audit(cfg.auditPath, msg.kind, { sessionId: data.sessionId, seq: msg.seq });
        const thinking: BridgeMessage = {
          kind: 'status',
          seq: msg.seq,
          sessionId: data.sessionId,
          timestamp: Date.now(),
          payload: { phase: 'thinking' },
        };
        const idle: BridgeMessage = {
          kind: 'status',
          seq: msg.seq,
          sessionId: data.sessionId,
          timestamp: Date.now() + 1,
          payload: { phase: 'idle' },
        };
        try {
          ws.send(encodeMessage(thinking));
          ws.send(encodeMessage(idle));
        } catch {
          // best-effort
        }
        // Best-effort persistence: read-modify-write the snapshot under
        // data.sessionId so cross-device clients can resume. Errors are
        // swallowed — persistence is advisory, not on the hot path.
        persistAfterMessage(sync, sessions, data.sessionId, data.clientId);
      },
      close(ws) {
        const data = ws.data;
        if (data.sessionId) sessions.shutdown(data.sessionId);
        audit(cfg.auditPath, 'disconnect', {
          clientId: data.clientId,
          sessionId: data.sessionId,
        });
      },
    },
  });

  // Give the listener a moment to finish binding before returning. Without
  // this, the first WebSocket connect after Bun.serve() can race the listen()
  // syscall and hang on some kernels (observed in bun:test runs).
  await new Promise((r) => setTimeout(r, 100));

  return {
    port: bunServer.port ?? 0,
    async stop() {
      await bunServer.stop();
    },
  };
}

function audit(path: string, event: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data }) + '\n';
  try {
    appendFileSync(path, line);
  } catch {
    // best-effort
  }
}

/**
 * P2.b.2 — read-only JSON snapshot router.
 *
 * Auth: same token model as the WS endpoint (query string `?token=`).
 * Routes:
 *   GET /bridge/snapshot/session/:id     — persisted SessionState
 *   GET /bridge/snapshot/dossier/:ticker — DossierStore.read(ticker)
 *
 * Anything else under /bridge/snapshot/* → 404. POST/PUT → 405.
 * Errors are returned as plain text (status + reason) for symmetry with
 * the existing WS auth errors.
 */
async function handleSnapshot(
  url: URL,
  req: Request,
  cfg: BridgeServerConfig,
  sync: SessionSync,
  auth: BridgeAuth,
): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  // Auth
  const token = url.searchParams.get('token');
  if (!token) {
    audit(cfg.auditPath, 'snapshot-reject', { reason: 'no-token', path: url.pathname });
    return new Response('Token required', { status: 401 });
  }
  const v = auth.verifyToken(token);
  const ok =
    v.ok ||
    (() => {
      // Dev-mode fallback matching the WS path: accept the raw secret.
      const tk = Buffer.from(token);
      const sk = Buffer.from(cfg.token);
      if (tk.length === sk.length && tk.length >= 8) {
        try { return timingSafeEqual(tk, sk); } catch { return false; }
      }
      return false;
    })();
  if (!ok) {
    audit(cfg.auditPath, 'snapshot-reject', { reason: v.reason ?? 'bad-token', path: url.pathname });
    return new Response('Unauthorized', { status: 401 });
  }

  // Route
  const rest = url.pathname.slice('/bridge/snapshot/'.length);
  const slash = rest.indexOf('/');
  const kind = slash < 0 ? rest : rest.slice(0, slash);
  const id = slash < 0 ? '' : rest.slice(slash + 1);
  if (!id) return new Response('Snapshot id required', { status: 400 });

  if (kind === 'session') {
    const persisted = await sync.load(id);
    if (!persisted) {
      return new Response(JSON.stringify({ error: 'session-not-found', id }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(persisted), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (kind === 'dossier') {
    if (!cfg.dossiers) {
      return new Response(
        JSON.stringify({ error: 'dossier-store-not-configured' }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }
    const d = cfg.dossiers.read(id);
    if (!d) {
      return new Response(JSON.stringify({ error: 'dossier-not-found', ticker: id }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(d), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(`Unknown snapshot kind: ${kind}`, { status: 404 });
}

/**
 * Late session-id binding for the message handler. If a chat carries a
 * sessionId that differs from the connection's current id, look it up on
 * disk: if a snapshot exists, swap the connection to it (rehydrating
 * history); otherwise adopt the message's id as the new anchor. This
 * function is fire-and-forget — the caller does not await it.
 */
function adoptMessageSessionId(
  sync: SessionSync,
  sessions: BridgeSessionStore,
  data: ConnState,
  msgSessionId: string,
): void {
  void sync
    .load(msgSessionId)
    .then((persisted) => {
      if (persisted) {
        const existing = sessions.get(msgSessionId);
        if (!existing) {
          const s = sessions.join(msgSessionId, data.clientId);
          s.history = [...persisted.history];
        }
      } else {
        // No snapshot yet — anchor on the message's id so future saves
        // land in the right file.
        sessions.join(msgSessionId, data.clientId);
      }
      data.sessionId = msgSessionId;
    })
    .catch(() => {
      // best-effort: leave data.sessionId as-is on failure
    });
}

/**
 * Read-modify-write the persisted snapshot after a bridge message. Merges
 * the current in-memory session state on top of any existing snapshot
 * (preserving messages/scratchpad/featureGates we don't track in memory).
 * Swallows all errors: persistence is advisory, the WS round-trip is
 * the source of truth.
 */
function persistAfterMessage(
  sync: SessionSync,
  sessions: BridgeSessionStore,
  sessionId: string,
  clientId: string,
): void {
  void sync
    .load(sessionId)
    .then((existing) => {
      const inMemory = sessions.get(sessionId);
      if (!inMemory) return;
      const now = Date.now();
      const next: SessionState = {
        sessionId,
        createdAt: existing?.createdAt ?? inMemory.createdAt,
        updatedAt: now,
        clientId,
        status: inMemory.status,
        history: inMemory.history,
        messages: existing?.messages ?? [],
        toolHistory: existing?.toolHistory ?? [],
        scratchpad: existing?.scratchpad ?? '',
        featureGates: existing?.featureGates ?? {},
        metadata: existing?.metadata ?? {},
      };
      return sync.save(next);
    })
    .catch(() => {
      // best-effort
    });
}
