/**
 * UpUp SDK — public entry point.
 *
 * Hosts (TradingAgents, Claude Code, Codex, custom IDE) call
 * `createUpUpSession(options)` and get back an `UpUpSessionHandle`. The
 * handle wraps the real Pi `AgentSession` via the runtime factory, but the
 * host only ever sees the 7-method public surface — no Pi types, no
 * UpUp package boundaries, no UpUp tools.
 *
 * Failure isolation:
 *   - The factory is created lazily so importing this module from a host
 *     that does not have the UpUp stack on `node_modules` gives a clear
 *     error message rather than a top-level `Cannot find module`.
 *   - A factory crash during `createSession` rejects the returned promise;
 *     the host can `try/catch` around the single call.
 *
 * Black-box promise:
 *   The 7 public methods (`prompt / steer / followUp / abort / close /
 *   fork / compact`) are deliberately stable. Any change here that breaks
 *   a host is a semver-major change. The handle intentionally hides:
 *   - Pi's `AgentSession` interface
 *   - UpUp `UpUpAgentEvent` granular events (forwarded as envelopes)
 *   - The Pi extension API surface
 *   - The Pi package catalog
 *
 *  Hosts that need raw access can drop down to `@upup/pi-session` directly,
 *  but doing so means accepting upstream Pi breakage.
 */

import { createUpUpSessionHandle, type CreateUpUpSessionRuntime } from './handle';
import { resolveUpUpSpec } from './default-specs';
import type { UpUpSessionOptions, UpUpSessionHandle, UpUpAgentSpec } from './types';
import { UpUpEventStream } from './event-stream';

/** Override the runtime factory (used by tests). */
export function createUpUpSession(
  options: UpUpSessionOptions = {},
  runtime: CreateUpUpSessionRuntime = loadDefaultRuntime(),
): Promise<UpUpSessionHandle> {
  const spec: UpUpAgentSpec = options.spec ?? resolveUpUpSpec(options.profile);
  const stream = new UpUpEventStream();
  if (options.onEvent) stream.addListener(options.onEvent);

  const handle = createUpUpSessionHandle({
    spec,
    sessionKey: options.sessionKey,
    cwd: options.cwd,
    financeContext: options.financeContext,
    stream,
    signal: options.signal,
    runtime,
  });
  return Promise.resolve(handle);
}

/**
 * Resolve the default runtime by dynamically importing `@upup/pi-session`.
 * A dynamic import means missing or broken packages surface as a
 * `createSession` rejection, not a top-level TypeError at module load.
 */
function loadDefaultRuntime(): CreateUpUpSessionRuntime {
  // The default runtime is provided by `@upup/pi-session`. We import it
  // through a `Function('s','return import(s)')` indirection so this
  // module does not get a hard ESM dependency on `@upup/pi-session` (the
  // SDK is intentionally optional from the host's perspective; a host
  // that does not need the full UpUp stack can pass its own `runtime`).
  const importer = new Function('s', 'return import(s)') as (s: string) => Promise<Record<string, unknown>>;
  let cached: CreateUpUpSessionRuntime | null = null;
  const loader: CreateUpUpSessionRuntime = {
    async createSession(args) {
      if (!cached) {
        const mod = await importer('@upup/pi-session');
        const factory = mod.createPiAgentRuntime as (composition?: unknown) => {
          createSession(spec: UpUpAgentSpec, options?: unknown): Promise<{
            id: string;
            spec: UpUpAgentSpec;
            prompt(input: string, options?: { signal?: AbortSignal }): Promise<void>;
            steer(input: string): Promise<void>;
            followUp(input: string): Promise<void>;
            abort(): Promise<void>;
            waitForIdle(): Promise<void>;
            compact(instructions?: string): Promise<void>;
            getSessionFile(): string | undefined;
            getSessionHeader(): { id: string; timestamp: string; cwd: string } | null;
            getSessionTree(): readonly unknown[];
            exportToJsonl(outputPath?: string): string;
            exportToHtml(outputPath?: string): Promise<string>;
            fork(entryId?: string): string | undefined;
            appendEntry<T = unknown>(customType: string, data?: T): void;
            appendSessionInfo(name: string): void;
            setFinanceContext(context: unknown): void;
            getFinanceContext(): unknown;
            getCustomEntries(customType?: string): readonly unknown[];
            getAvailableToolNames(): readonly string[];
          }>;
        };
        cached = {
          async createSession(innerArgs) {
            const session = await factory().createSession(innerArgs.spec, {
              cwd: innerArgs.cwd,
              sessionId: innerArgs.sessionKey,
            });
            return session as unknown as Awaited<ReturnType<CreateUpUpSessionRuntime['createSession']>>;
          },
        };
      }
      return cached.createSession(args);
    },
  };
  return loader;
}
