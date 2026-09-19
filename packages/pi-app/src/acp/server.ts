/**
 * ACP (Agent Client Protocol) server for `upup --acp`.
 *
 * Editor hosts (Zed, Neovim plugins, custom IDE front-ends) drive the agent
 * with JSON-RPC 2.0 over stdio:
 *
 *   → `initialize`            ← protocol version + capabilities
 *   → `session/new`           ← { sessionId }
 *   → `session/prompt`        ← streams `session/update` notifications,
 *                               then resolves with { stopReason }
 *   → `session/cancel`        ← aborts the in-flight turn
 *
 * Everything below is a **translation layer**, not a second agent: each
 * request maps onto the same UpUp `PiAgentSessionFactory` session the TUI and
 * the headless surfaces use, and each Pi event goes through
 * `mapUpUpEventToAcpUpdate`. There is no bespoke agent loop here — that is the
 * whole point of the Pi-native architecture.
 *
 * Why this exists: the Pi Native migration deleted the previous ACP adapter
 * and repointed `--acp` at Pi's plain RPC mode, which speaks `{ type: ... }`
 * commands. The flag (and its help text) kept advertising ACP method names, so
 * every ACP client received `Unknown command: undefined`. This restores the
 * advertised protocol on top of the surviving Pi session.
 */

import type { UpUpAgentEvent } from '@upup/pi-runtime';
import {
  AcpMethod,
  buildAcpInitializeResult,
  mapUpUpEventToAcpUpdate,
  resolveAcpStopReason,
  translateAcpNewSessionParams,
  translateAcpPromptParams,
  type AcpStopReason,
} from './translate';

/** Minimal session surface the ACP front-end needs (satisfied by Pi). */
export interface AcpSessionPort {
  readonly id: string;
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<void>;
  abort(): Promise<void>;
  subscribe(listener: (event: UpUpAgentEvent) => void): () => void;
  dispose(): void;
}

export interface AcpSessionFactoryPort {
  createSession(options: { cwd?: string }): Promise<AcpSessionPort>;
}

export interface AcpServerOptions {
  /** Where sessions are created and resources are discovered. */
  readonly cwd?: string;
  /** Input stream (defaults to `process.stdin`). */
  readonly input?: NodeJS.ReadableStream;
  /** Output stream (defaults to `process.stdout`). */
  readonly output?: NodeJS.WritableStream;
  /** Session factory; defaults to the Pi-native factory. */
  readonly sessionFactory?: AcpSessionFactoryPort;
  /** Optional notice sink for diagnostics (never written to `output`). */
  readonly log?: (message: string) => void;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface AcpServerHandle {
  /** Resolves once the input stream ends and every session is disposed. */
  readonly done: Promise<void>;
  /** Stop reading input and dispose sessions. */
  stop(): Promise<void>;
}

/**
 * One live ACP session. Owns the Pi session plus the currently streaming
 * prompt, so `session/cancel` can abort without tearing the session down.
 */
class AcpSession {
  private readonly listeners = new Set<(event: UpUpAgentEvent) => void>();
  private readonly unsubscribe: () => void;
  private activePrompt: { controller: AbortController; completion: Promise<void> } | undefined;
  private lastEvent: UpUpAgentEvent | undefined;

  constructor(
    private readonly session: AcpSessionPort,
    private readonly emit: (update: Record<string, unknown>) => void,
  ) {
    this.unsubscribe = session.subscribe((event) => {
      this.lastEvent = event;
      for (const listener of this.listeners) listener(event);
    });
  }

  get id(): string {
    return this.session.id;
  }

  /**
   * Run one prompt, forwarding each Pi event as a `session/update`
   * notification. Resolves with the ACP stop reason.
   */
  async prompt(text: string): Promise<AcpStopReason> {
    const controller = new AbortController();
    const forward = (event: UpUpAgentEvent): void => {
      // SAFETY: `mapUpUpEventToAcpUpdate` only switches on `event.type` and
      // narrows the payload itself; it never reads the rest of `UpUpAgentEvent`,
      // so erasing that surface here cannot hide a mismatch it would otherwise catch.
      const update = mapUpUpEventToAcpUpdate(event as unknown as { type: string });
      if (update) this.emit({ ...update });
    };
    this.listeners.add(forward);
    const completion = this.session.prompt(text, { signal: controller.signal });
    this.activePrompt = { controller, completion };
    try {
      await completion;
      // An abort may surface either way: Pi can reject the prompt, or resolve
      // it having produced a truncated turn. Check the signal *before* the
      // last event, otherwise a cancellation that resolved reports
      // `end_turn` and the editor shows a finished turn that never finished.
      if (controller.signal.aborted) return 'cancelled';
      return resolveAcpStopReason(this.lastEvent as { type: string } | undefined);
    } catch (error) {
      if (controller.signal.aborted) return 'cancelled';
      throw error;
    } finally {
      this.listeners.delete(forward);
      this.activePrompt = undefined;
    }
  }

  /** Abort an in-flight prompt. A no-op when nothing is streaming. */
  async cancel(): Promise<void> {
    const active = this.activePrompt;
    if (!active) return;
    active.controller.abort();
    // The prompt promise is what actually settles the request; swallow the
    // abort rejection here so cancellation is reported once, by `prompt()`.
    await active.completion.catch(() => undefined);
    await this.session.abort().catch(() => undefined);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
    this.session.dispose();
  }
}

/**
 * Create the ACP server. Returns a handle rather than starting implicitly so
 * callers can attach diagnostics before the first byte is read.
 */
export function createAcpServer(options: AcpServerOptions = {}): AcpServerHandle {
  // Annotated on purpose: `process.stdin` is a `net.Socket` subclass, and a
  // union of its typed `on()` overloads with `NodeJS.ReadableStream`'s is not
  // callable. The narrow stream surface is all this server uses.
  const input: NodeJS.ReadableStream = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const log = options.log ?? (() => {});
  const sessions = new Map<string, AcpSession>();
  /** Input detached; no new frames accepted, but responses may still be written. */
  let accepting = true;
  /** Output finished; nothing more may be written. */
  let closed = false;
  let settleDone: () => void = () => {};
  const done = new Promise<void>((resolve) => { settleDone = resolve; });
  /**
   * In-flight request handlers.
   *
   * A piped client writes every frame and closes stdin in one go, so `end`
   * arrives while `session/new` and friends are still awaiting the session
   * factory. Tearing down on `end` alone would drop their responses — the
   * client would see a clean EOF and no result, which is exactly the
   * "silently does nothing" failure this server must not have. Track pending
   * work and let `finish()` wait for it.
   */
  const inFlight = new Set<Promise<void>>();

  const write = (frame: unknown): void => {
    // Deliberately keyed on `closed`, not on `accepting`: a piped client sends
    // every frame and closes stdin at once, and responses that finish during
    // the drain must still reach it. Suppressing them here is what made
    // `session/new` return nothing at all.
    if (closed) return;
    output.write(`${JSON.stringify(frame)}\n`);
  };
  /** JSON-RPC success envelope for a request id. */
  const reply = (id: JsonRpcRequest['id'], result: unknown): void => {
    write({ jsonrpc: '2.0', id: id ?? null, result });
  };
  /** JSON-RPC error envelope for a request id. */
  const replyError = (id: JsonRpcRequest['id'], code: number, message: string): void => {
    write({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  };

  const requireFactory = (): AcpSessionFactoryPort => {
    if (!options.sessionFactory) {
      throw new Error('ACP server started without a session factory');
    }
    return options.sessionFactory;
  };

  const handleRequest = async (request: JsonRpcRequest): Promise<void> => {
    const method = request.method ?? '';
    const params = request.params ?? {};
    switch (method) {
      case AcpMethod.Initialize:
        reply(request.id, buildAcpInitializeResult());
        return;

      case AcpMethod.NewSession: {
        const { cwd } = translateAcpNewSessionParams(params);
        const session = await requireFactory().createSession(cwd ? { cwd } : {});
        const acpSession = new AcpSession(session, (update) => {
          // ACP notifications carry no id and use the session as their scope.
          write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: session.id, update } });
        });
        sessions.set(session.id, acpSession);
        reply(request.id, { sessionId: session.id });
        return;
      }

      case AcpMethod.LoadSession: {
        // UpUp resumes by session key; ACP hands us the id it was given.
        const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
        const existing = sessionId ? sessions.get(sessionId) : undefined;
        if (!existing) {
          replyError(request.id, -32001, `unknown session: ${sessionId ?? '(none)'}`);
          return;
        }
        reply(request.id, { sessionId: existing.id });
        return;
      }

      case AcpMethod.Prompt: {
        const { prompt, sessionId } = translateAcpPromptParams(params);
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session) {
          replyError(request.id, -32001, `unknown session: ${sessionId ?? '(none)'}`);
          return;
        }
        if (!prompt) {
          replyError(request.id, -32602, 'session/prompt requires a non-empty prompt');
          return;
        }
        try {
          reply(request.id, { stopReason: await session.prompt(prompt) });
        } catch (error) {
          replyError(request.id, -32603, error instanceof Error ? error.message : String(error));
        }
        return;
      }

      case AcpMethod.Cancel: {
        const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session) {
          replyError(request.id, -32001, `unknown session: ${sessionId ?? '(none)'}`);
          return;
        }
        await session.cancel();
        reply(request.id, {});
        return;
      }

      case AcpMethod.Authenticate:
      case AcpMethod.SetSessionMode:
        // Accepted and ignored: UpUp authenticates through Pi's `/login`
        // (credentials live in `~/.upup/agent/auth.json`), and mode selection
        // is a Pi-side concern. Acknowledging keeps ACP hosts that probe these
        // methods working.
        reply(request.id, {});
        return;

      default:
        replyError(request.id, -32601, `Method not found: ${method}`);
    }
  };

  let buffer = '';
  const onData = (chunk: Buffer | string): void => {
    buffer += chunk.toString();
    dispatchBuffered();
  };

  const finish = (): Promise<void> => {
    if (!accepting) return done;
    accepting = false;
    input.off('data', onData);
    input.off('end', onDrain);
    input.off('close', onDrain);
    // Let every response already computed for a buffered frame reach the
    // client before the streams close, then release the sessions.
    return Promise.all([...inFlight]).catch(() => undefined).then(() => {
      for (const session of sessions.values()) session.dispose();
      sessions.clear();
      closed = true;
      log('acp server stopped');
      settleDone();
    });
  };
  const onDrain = (): void => { void finish(); };

  /** Parse and dispatch every complete line currently buffered. */
  const dispatchBuffered = (): void => {
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let parsed: JsonRpcRequest;
      try {
        parsed = JSON.parse(line) as JsonRpcRequest;
      } catch {
        replyError(null, -32700, 'Parse error');
        continue;
      }
      // Notifications (no id) expect no response; the only one defined here is
      // `session/update` from the client, which UpUp does not consume.
      if (parsed.id === undefined && parsed.method !== undefined) continue;
      const pending = handleRequest(parsed).catch((error: unknown) => {
        replyError(parsed.id, -32603, error instanceof Error ? error.message : String(error));
      });
      inFlight.add(pending);
      void pending.finally(() => inFlight.delete(pending));
    }
  };

  input.on('data', onData);
  input.once('end', onDrain);
  input.once('close', onDrain);
  // A stdin that is already closed (piped input finished before we attached)
  // never emits `end` again; honour the flag so the process can exit.
  if ((input as { readableEnded?: boolean }).readableEnded) onDrain();

  return {
    done,
    async stop() {
      for (const session of sessions.values()) await session.cancel();
      await finish();
      await done;
    },
  };
}
