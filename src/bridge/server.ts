import { BridgeAuth } from './auth.js';
import { BridgeSessionStore } from './session.js';
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol.js';
import { appendFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

export interface BridgeServerConfig {
  port: number;
  bind?: string;
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
      const upgraded = srv.upgrade(req, {
        data: { clientId, sessionId: '', ip } as ConnState,
      });
      if (upgraded) return undefined;
      return new Response('Upgrade failed', { status: 500 });
    },
    websocket: {
      open(ws) {
        const data = ws.data as ConnState;
        const session = sessions.start(data.clientId);
        data.sessionId = session.id;
        audit(cfg.auditPath, 'connect', {
          clientId: data.clientId,
          sessionId: session.id,
          ip: data.ip,
        });
        const status: BridgeMessage = {
          kind: 'status',
          seq: 0,
          sessionId: session.id,
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
        const data = ws.data as ConnState;
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
      },
      close(ws) {
        const data = ws.data as ConnState;
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
    port: bunServer.port,
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
