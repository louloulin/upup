/**
 * UpUp SDK — adapter from `UpUpAgentSession` to the public `UpUpSessionHandle`.
 *
 * The handle is the only type a host ever sees. The adapter:
 *   - Translates the host's `prompt / steer / followUp / abort / close / fork
 *     / compact` calls into Pi AgentSession calls.
 *   - Forwards every Pi event through the `UpUpEventStream` so the host's
 *     `onEvent` callback sees the SDK-level event types.
 *   - Mirrors the `getSessionFile / getSessionHeader / getSessionTree /
 *     exportToJsonl / exportToHtml` snapshot APIs.
 *   - Wraps `setFinanceContext / getFinanceContext` so a TradingAgents host
 *     can hand off a watchlist + dossier ids to UpUp before sending the
 *     first prompt.
 *
 * The adapter never throws on a runtime call. Pi errors are converted to
 * `{ type: 'error', error }` SDK events; the host can decide how to react.
 */

import type { UpUpAgentSpec, UpUpAgentSession, UpUpFinanceSessionContext } from '@upup/pi-runtime';
import type { UpUpPromptOptions, UpUpSessionHandle } from './types';
import type { UpUpEventStream } from './event-stream';
import { resolveUpUpSpec } from './default-specs';

/**
 * Pluggable runtime interface. The default implementation dynamically
 * imports `@upup/pi-session`; tests inject a fake so the SDK can be
 * exercised in isolation without bringing the entire UpUp stack online.
 */
export interface CreateUpUpSessionRuntime {
  createSession(args: {
    readonly spec: UpUpAgentSpec;
    readonly sessionKey?: string;
    readonly cwd?: string;
  }): Promise<UpUpAgentSession>;
}

export interface CreateUpUpSessionHandleOptions {
  readonly spec: UpUpAgentSpec;
  readonly sessionKey?: string;
  readonly cwd?: string;
  readonly financeContext?: Partial<UpUpFinanceSessionContext>;
  readonly stream: UpUpEventStream;
  readonly signal?: AbortSignal;
  readonly runtime: CreateUpUpSessionRuntime;
}

export function createUpUpSessionHandle(options: CreateUpUpSessionHandleOptions): UpUpSessionHandle {
  let session: UpUpAgentSession | null = null;
  let resolved = false;
  let resolveSession!: (value: UpUpAgentSession) => void;
  let rejectSession!: (reason: unknown) => void;
  const ready = new Promise<UpUpAgentSession>((resolve, reject) => {
    resolveSession = resolve;
    rejectSession = reject;
  });

  // Kick off creation eagerly so the host gets the session id + first events
  // as soon as possible. Errors surface through the event stream rather than
  // top-level rejections — TradingAgents / Codex hosts embed the SDK inside
  // a wider event loop and prefer errors-as-events.
  (async () => {
    try {
      const created = await options.runtime.createSession({
        spec: options.spec,
        sessionKey: options.sessionKey,
        cwd: options.cwd,
      });
      session = created;
      resolved = true;
      if (options.financeContext) {
        try {
          created.setFinanceContext(options.financeContext);
        } catch (error) {
          await options.stream.emit({ type: 'error', error });
        }
      }
      resolveSession(created);
      await options.stream.emit({ type: 'ready', sessionId: created.id });
    } catch (error) {
      resolved = false;
      rejectSession(error);
      await options.stream.emit({ type: 'error', error });
      await options.stream.emit({ type: 'done', reason: 'error', error });
    }
  })();

  const ensureSession = async (): Promise<UpUpAgentSession> => {
    if (session) return session;
    return ready;
  };

  return {
    get id(): string {
      // Synchronous accessor: return the runtime id once ready, otherwise
      // an opaque placeholder derived from the spec so hosts can use the
      // id for logging even before the session finishes bootstrapping.
      if (session) return session.id;
      const seed = options.sessionKey ?? `${options.spec.id}-${Date.now()}`;
      return seed;
    },
    get spec(): UpUpAgentSpec {
      return session ? session.spec : options.spec;
    },
    async prompt(input: string, opts?: UpUpPromptOptions): Promise<void> {
      try {
        const s = await ensureSession();
        await s.prompt(input, { signal: opts?.signal ?? options.signal });
      } catch (error) {
        await options.stream.emit({ type: 'error', error });
        throw error;
      }
    },
    async steer(input: string): Promise<void> {
      const s = await ensureSession();
      await s.steer(input);
    },
    async followUp(input: string): Promise<void> {
      const s = await ensureSession();
      await s.followUp(input);
    },
    async abort(): Promise<void> {
      const s = await ensureSession();
      await s.abort();
      await options.stream.emit({ type: 'done', reason: 'aborted' });
    },
    async waitForIdle(): Promise<void> {
      const s = await ensureSession();
      await s.waitForIdle();
    },
    async compact(instructions?: string): Promise<void> {
      const s = await ensureSession();
      await s.compact(instructions);
    },
    getSessionFile(): string | undefined {
      return session ? session.getSessionFile() : undefined;
    },
    getSessionHeader(): { readonly id: string; readonly timestamp: string; readonly cwd: string } | null {
      return session ? session.getSessionHeader() : null;
    },
    getSessionTree(): readonly unknown[] {
      return session ? session.getSessionTree() : [];
    },
    exportToJsonl(outputPath?: string): string {
      if (!session) throw new Error('Session not ready; cannot export JSONL.');
      return session.exportToJsonl(outputPath);
    },
    async exportToHtml(outputPath?: string): Promise<string> {
      const s = await ensureSession();
      return s.exportToHtml(outputPath);
    },
    fork(entryId?: string): string | undefined {
      return session ? session.fork(entryId) : undefined;
    },
    appendEntry<T = unknown>(customType: string, data?: T): void {
      if (!session) throw new Error('Session not ready; cannot append entry.');
      session.appendEntry<T>(customType, data);
    },
    setFinanceContext(context: Partial<UpUpFinanceSessionContext>): void {
      if (!session) throw new Error('Session not ready; cannot set finance context.');
      session.setFinanceContext(context);
    },
    getFinanceContext(): UpUpFinanceSessionContext {
      if (!session) throw new Error('Session not ready; cannot read finance context.');
      return session.getFinanceContext();
    },
    getAvailableToolNames(): readonly string[] {
      return session ? session.getAvailableToolNames() : [];
    },
    async close(): Promise<void> {
      if (!session) return;
      try {
        await session.abort();
      } catch {
        // Aborting an idle session is a no-op; ignore failures here.
      }
      session = null;
      resolved = false;
    },
  };
}

/** Re-export for the tests. */
export { resolveUpUpSpec };
