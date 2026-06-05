import { BridgeAuth } from './auth.js';
import { BridgeSessionStore } from './session.js';
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol.js';
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

  const bunServer = Bun.serve({
    port: cfg.port,
    hostname: bind,
    async fetch(req, srv) {
      const url = new URL(req.url);
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
