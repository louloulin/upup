import { BridgeAuth } from './auth';
import { BridgeSessionStore } from './session';
import { decodeMessage, encodeMessage, type BridgeMessage } from './protocol';
import { DossierStore } from '@upup/pi-storage';
import { SessionSync, type SessionState } from './session-sync';
import { appendFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runAgentForMessage, type AgentRunRequest, type GatewayRuntime } from '@upup/gateway';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

/**
 * Build a JSON response with the correct content-type. Centralized so
 * every snapshot/health endpoint produces a structurally identical
 * `Response` and tests don't have to re-assert the headers in 4 places.
 */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Verify a bridge token. The WS fetch path and the snapshot endpoints
 * both need the same auth model: prefer a signed bridge token from
 * `BridgeAuth.issueToken`, fall back to the raw secret for dev / CLI
 * ergonomics (production should always use the signed format).
 *
 * Returns the clientId on success, or a string reason on failure.
 */
export function verifyBridgeToken(
  token: string,
  expectedSecret: string,
  auth: BridgeAuth,
): { ok: true; clientId: string } | { ok: false; reason: string } {
  const v = auth.verifyToken(token);
  if (v.ok) return { ok: true, clientId: v.clientId };
  // Dev-mode fallback: accept the raw secret directly. Same length check
  // as the WS path to avoid leaking timing info on length mismatches.
  const tk = Buffer.from(token);
  const sk = Buffer.from(expectedSecret);
  if (tk.length === sk.length && tk.length >= 8) {
    try {
      if (timingSafeEqual(tk, sk)) return { ok: true, clientId: 'shared-secret' };
    } catch { /* fallthrough */ }
  }
  return { ok: false, reason: v.reason ?? 'bad-token' };
}

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
  /** Pi-backed message execution hook. Defaults to the production Gateway runner. */
  agentRunner?: (request: AgentRunRequest) => Promise<string>;
  runtime: GatewayRuntime;
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
  const agentRunner = cfg.agentRunner ?? ((request) => runAgentForMessage(request, cfg.runtime.agent));

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
        return jsonResponse(200, { ok: true, ts: Date.now(), port: srv.port ?? 0, version: '0.0.0' });
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
      const v = verifyBridgeToken(token, cfg.token, auth);
      if (!v.ok) {
        audit(cfg.auditPath, 'reject', { reason: v.reason });
        return new Response('Unauthorized', { status: 401 });
      }
      const clientId = v.clientId;
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
        // The queued microtask runs after Bun finishes the open callback,
        // while preserving handshake-before-chat ordering on this socket.
        sendBridge(ws, status);
      },
      async message(ws, raw) {
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
        sendBridge(ws, thinking);
        if (msg.kind === 'chat' && msg.payload.role === 'user') {
          const configRuntime = cfg.runtime.config;
          const request: AgentRunRequest = {
            sessionKey: data.sessionId,
            query: msg.payload.content,
            model: configRuntime.getConfiguredModelId(),
            modelProvider: configRuntime.getConfiguredProvider(),
            onEvent: async (event: UpUpAgentEvent) => {
              if (event.type === 'tool_start') {
                sendBridge(ws, {
                  kind: 'status',
                  seq: msg.seq,
                  sessionId: data.sessionId,
                  timestamp: Date.now(),
                  payload: { phase: 'tool' },
                });
              } else if (event.type === 'tool_end') {
                sendBridge(ws, {
                  kind: 'output',
                  seq: msg.seq,
                  sessionId: data.sessionId,
                  timestamp: Date.now(),
                  payload: {
                    tool: event.toolName,
                    result: event.error ?? 'completed',
                    latencyMs: 0,
                  },
                });
              }
            },
          };
          void agentRunner(request).then(async (answer) => {
            if (answer.trim()) {
              const assistant: BridgeMessage = {
                kind: 'chat',
                seq: msg.seq,
                sessionId: data.sessionId,
                timestamp: Date.now(),
                payload: { role: 'assistant', content: answer },
              };
              sessions.recordEvent(data.sessionId, assistant.kind, assistant.payload);
              sendBridge(ws, assistant);
            }
            sendBridge(ws, {
              kind: 'status',
              seq: msg.seq,
              sessionId: data.sessionId,
              timestamp: Date.now(),
              payload: { phase: 'done' },
            });
            await persistAfterMessage(sync, sessions, data.sessionId, data.clientId);
            sendBridge(ws, {
              kind: 'status',
              seq: msg.seq,
              sessionId: data.sessionId,
              timestamp: Date.now() + 1,
              payload: { phase: 'idle' },
            });
          }).catch(async (error: unknown) => {
            audit(cfg.auditPath, 'agent-error', {
              sessionId: data.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
            await persistAfterMessage(sync, sessions, data.sessionId, data.clientId);
            sendBridge(ws, {
              kind: 'status',
              seq: msg.seq,
              sessionId: data.sessionId,
              timestamp: Date.now(),
              payload: { phase: 'idle' },
            });
          });
        } else {
          await persistAfterMessage(sync, sessions, data.sessionId, data.clientId);
          sendBridge(ws, {
            kind: 'status',
            seq: msg.seq,
            sessionId: data.sessionId,
            timestamp: Date.now() + 1,
            payload: { phase: 'idle' },
          });
        }
      },
      close(ws) {
        const data = ws.data;
        bridgeSendQueues.delete(ws as object);
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

const bridgeSendQueues = new WeakMap<object, Promise<void>>();

function sendBridge(ws: { send(data: Uint8Array): void }, message: BridgeMessage): void {
  const socket = ws as object;
  const previous = bridgeSendQueues.get(socket) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => {
      try {
        ws.send(encodeMessage(message));
      } catch {
        // The client may disconnect while a Pi turn is still finishing.
      }
    });
  bridgeSendQueues.set(socket, next);
  void next.catch(() => undefined);
}

/**
 * P2.b.2 — read-only JSON snapshot router.
 *
 * Auth: same token model as the WS endpoint (query string `?token=`).
 * Auth path is shared with the WS handler via `verifyBridgeToken`.
 *
 * Routes (table-driven, see SNAPSHOT_HANDLERS):
 *   GET /bridge/snapshot/session/:id     — persisted SessionState
 *   GET /bridge/snapshot/dossier/:ticker — DossierStore.read(ticker)
 *
 * Anything else under /bridge/snapshot/* → 404. POST/PUT → 405.
 *
 * Each handler signature: `(id, deps) => Promise<Response> | Response`.
 * Adding a new snapshot kind is one entry in the table — no edits to
 * handleSnapshot itself.
 */

interface SnapshotDeps {
  cfg: BridgeServerConfig;
  sync: SessionSync;
}

type SnapshotHandler = (id: string, deps: SnapshotDeps) => Promise<Response> | Response;

const SNAPSHOT_HANDLERS: Record<string, SnapshotHandler> = {
  session: async (id, { sync }) => {
    const persisted = await sync.load(id);
    if (!persisted) {
      return jsonResponse(404, { error: 'session-not-found', id });
    }
    return jsonResponse(200, persisted);
  },
  dossier: (id, { cfg }) => {
    if (!cfg.dossiers) {
      return jsonResponse(503, { error: 'dossier-store-not-configured' });
    }
    const d = cfg.dossiers.read(id);
    if (!d) {
      return jsonResponse(404, { error: 'dossier-not-found', ticker: id });
    }
    return jsonResponse(200, d);
  },
};

function parseSnapshotPath(pathname: string): { kind: string; id: string } | null {
  const rest = pathname.slice('/bridge/snapshot/'.length);
  if (!rest) return null;
  const slash = rest.indexOf('/');
  const kind = slash < 0 ? rest : rest.slice(0, slash);
  const id = slash < 0 ? '' : rest.slice(slash + 1);
  if (!kind) return null;
  return { kind, id };
}

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
  // Auth (shared with the WS fetch handler — see verifyBridgeToken)
  const token = url.searchParams.get('token');
  if (!token) {
    audit(cfg.auditPath, 'snapshot-reject', { reason: 'no-token', path: url.pathname });
    return new Response('Token required', { status: 401 });
  }
  const v = verifyBridgeToken(token, cfg.token, auth);
  if (!v.ok) {
    audit(cfg.auditPath, 'snapshot-reject', { reason: v.reason, path: url.pathname });
    return new Response('Unauthorized', { status: 401 });
  }

  // Route dispatch
  const parsed = parseSnapshotPath(url.pathname);
  if (!parsed) return new Response('Snapshot id required', { status: 400 });
  const handler = SNAPSHOT_HANDLERS[parsed.kind];
  if (!handler) return new Response(`Unknown snapshot kind: ${parsed.kind}`, { status: 404 });
  if (!parsed.id) return new Response('Snapshot id required', { status: 400 });
  return handler(parsed.id, { cfg, sync });
}

/**
 * @internal — exported for tests so the auth + JSON helpers can be
 * exercised directly without spinning up the bridge server.
 */
export const _internal = { parseSnapshotPath };

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
async function persistAfterMessage(
  sync: SessionSync,
  sessions: BridgeSessionStore,
  sessionId: string,
  clientId: string,
): Promise<void> {
  try {
    const existing = await sync.load(sessionId);
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
    await sync.save(next);
  } catch {
    // best-effort: persistence is advisory, the WS round-trip is the source of truth.
  }
}
