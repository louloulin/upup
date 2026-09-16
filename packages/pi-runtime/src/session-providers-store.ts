/**
 * Session-scoped capability provider store.
 *
 * Sprint D Phase 2: replaces the legacy `agent-session-factory`'s
 * `installPiPackageToolHosts` with a module-level store keyed by session id.
 *
 * Lifecycle:
 *   1. `agent-session-factory` builds the rich provider tree (quote client,
 *      cron runner, MCP resources, workflow services, etc.) once during
 *      `createSession`.
 *   2. It calls `setSessionProviders(sessionId, providers)` to publish the
 *      tree into the store.
 *   3. Each `@upup/pi-*` extension's `definePiCapabilityHost` reads from
 *      `getSessionProviders(sessionId)` when constructing its host. If the
 *      store is empty (test stub or standalone extension usage) the
 *      extension self-publishes with metadata-only providers and falls back
 *      to its built-in fetch paths.
 *   4. `clearSessionProviders(sessionId)` is called on session dispose.
 *
 * Why a module-level store (and not pure event bus):
 *   - The provider tree is session-scoped and only valid for the lifetime
 *     of one Pi `AgentSession`. Multiple sessions coexist during worker
 *     dispatch (`runWorkerPrompt`); the store keeps each session's providers
 *     isolated.
 *   - Extensions synchronously need providers at self-publish time. The
 *     event bus's `resolve` callback works but adds a publish/subscribe
 *     roundtrip on every `resolvePiCapabilityHost` call; the store is O(1).
 *
 * Note: this is still an in-process singleton (one Bun process hosts all
 * sessions). It does NOT introduce a global registry leak — every entry
 * is keyed by an opaque session id and disposed by the caller.
 */

interface SessionProvidersStore {
  readonly [key: string]: unknown;
}

const sessionProviders = new Map<string, SessionProvidersStore>();

export interface SetSessionProvidersOptions {
  /** When true, dispose the previous entry before storing (default true). */
  readonly replace?: boolean;
}

export function setSessionProviders<T extends SessionProvidersStore>(
  sessionId: string,
  providers: T,
  options: SetSessionProvidersOptions = {},
): () => void {
  if (!sessionId.trim()) {
    throw new Error('setSessionProviders requires a non-empty sessionId');
  }
  const previous = sessionProviders.get(sessionId);
  const replace = options.replace ?? true;
  sessionProviders.set(sessionId, providers);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const current = sessionProviders.get(sessionId);
    if (current === providers) {
      // The entry we wrote is still there. Either delete (replace=false) or
      // restore the previous entry (replace=true).
      if (replace) {
        if (previous) sessionProviders.set(sessionId, previous);
        else sessionProviders.delete(sessionId);
      } else {
        sessionProviders.delete(sessionId);
      }
    } else if (previous) {
      // Someone else overwrote our entry; restore previous on top so the
      // outer session's providers are not silently lost.
      sessionProviders.set(sessionId, previous);
    }
  };
}

export function getSessionProviders<T extends SessionProvidersStore = SessionProvidersStore>(
  sessionId: string,
): T | undefined {
  if (!sessionId) return undefined;
  return sessionProviders.get(sessionId) as T | undefined;
}

export function clearSessionProviders(sessionId: string): void {
  sessionProviders.delete(sessionId);
}

export function listSessionProvidersKeys(): readonly string[] {
  return [...sessionProviders.keys()];
}

/** Test-only: reset the entire store. */
export function __resetSessionProvidersForTests(): void {
  sessionProviders.clear();
}
