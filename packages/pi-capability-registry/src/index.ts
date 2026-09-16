export const PI_CAPABILITY_REGISTRY_CONTRACT = 'upup.pi.capability-registry.v1' as const;

export const PI_CAPABILITY_RESOLVE_CHANNEL = 'upup.pi.capability.resolve.v1' as const;

export interface PiCapabilityEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

export interface PiCapabilityHostRecord {
  readonly contract: string;
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly string[];
  readonly [key: string]: unknown;
}

/**
 * Structural contract every registered host must satisfy. The full
 * `PiCapabilityHostRecord` keeps an open index signature for runtime
 * `unknown`-keyed lookups; host interfaces declared via `interface`
 * (rather than `type`) do not get an implicit index signature, so we
 * separate the minimal structural contract from the runtime lookup
 * shape and reuse the structural one as the generic constraint.
 */
export interface PiCapabilityHostShape {
  readonly contract?: string;
  readonly packageName: string;
  readonly packageVersion?: string;
  readonly sessionId?: string;
  readonly capabilities: readonly string[];
}

export interface PiCapabilityRegistrySnapshot {
  readonly contract: typeof PI_CAPABILITY_REGISTRY_CONTRACT;
  readonly sessionId: string;
  readonly packages: readonly { readonly name: string; readonly version: string; readonly capabilities: readonly string[] }[];
}

export class PiCapabilityRegistry {
  private readonly sessions = new Map<string, Map<string, PiCapabilityHostRecord>>();
  registerSession(sessionId: string, hosts: ReadonlyMap<string, PiCapabilityHostRecord>): () => void {
    if (!sessionId.trim()) throw new Error('Pi capability session id is required');
    const sessionHosts = new Map<string, PiCapabilityHostRecord>();
    for (const [packageName, host] of hosts) {
      if (host.packageName !== packageName || host.sessionId !== sessionId) throw new Error(`Pi capability host identity mismatch: ${packageName}`);
      sessionHosts.set(packageName, host);
    }
    const previous = this.sessions.get(sessionId);
    this.sessions.set(sessionId, sessionHosts);
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      if (previous) this.sessions.set(sessionId, previous);
      else this.sessions.delete(sessionId);
    };
  }

  disposeSession(sessionId: string): void { this.sessions.delete(sessionId); }

  resolve<T extends PiCapabilityHostRecord = PiCapabilityHostRecord>(sessionId: string, packageName: string): T | undefined {
    const host = this.sessions.get(sessionId)?.get(packageName);
    if (!host || host.packageName !== packageName || host.sessionId !== sessionId || host.contract.length === 0) return undefined;
    return host as T;
  }

  has(sessionId: string, packageName: string, capability?: string): boolean {
    const host = this.resolve(sessionId, packageName);
    return Boolean(host && (capability === undefined || host.capabilities.includes(capability)));
  }

  snapshot(sessionId: string): PiCapabilityRegistrySnapshot {
    return {
      contract: PI_CAPABILITY_REGISTRY_CONTRACT,
      sessionId,
      packages: [...(this.sessions.get(sessionId)?.values() ?? [])].map((host) => ({ name: host.packageName, version: host.packageVersion, capabilities: [...host.capabilities] })),
    };
  }

  clear(sessionId: string): void { this.disposeSession(sessionId); }
}

/**
 * Sprint D self-publish helper for Pi extensions.
 *
 * Replaces the legacy `registerPiCapabilityHost` consumer pattern with a
 * publisher pattern: a Pi extension that ships its own providers no longer
 * waits for `agent-session-factory` to assemble the host and emit it via
 * `publishPiCapabilityHosts`. Instead the extension declares its providers
 * at register-time and `definePiCapabilityHost` both publishes them and
 * synchronously hands them to the user's `register` callback as a closure.
 *
 * Why this matters: every `@upup/pi-*` extension was previously coupled to
 * the UpUp session orchestrator (it had to be loaded inside a `PiAgentSession`
 * for the host to exist). With self-publish each extension is self-contained
 * — it can run inside any Pi agent session, headless, or even as a standalone
 * test. The session orchestrator only owns cross-cutting concerns (policy,
 * branding, event bridge), not capability wiring.
 */
export interface DefinePiCapabilityHostOptions<TProviders extends Record<string, unknown>> {
  /** Package name, e.g. '@upup/pi-finance-sdk'. Must be stable across versions. */
  readonly packageName: string;
  /** Package version, used for fail-closed mismatch detection. */
  readonly packageVersion: string;
  /** Capability names exposed by this host. Used by resolve() to gate access. */
  readonly capabilities: readonly string[];
  /** Optional contract id override. Defaults to 'upup.pi.host.v1'. */
  readonly contract?: string;
  /** Provider tree handed to the register callback. Must be JSON-serializable
   *  (or pure functions) since cross-extension callers may pass it across
   *  boundaries. */
  readonly providers: TProviders;
  /** Synchronous register invoked with the bound providers. The closure can
   *  register Pi tools that consume `services.providers` directly without
   *  re-resolving via the event bus. */
  readonly register: (services: {
    readonly sessionId: string;
    readonly providers: TProviders;
  }) => void;
}

/**
 * Narrowed ExtensionAPI subset required by `definePiCapabilityHost`. Mirrors
 * `PiCapabilityExtensionApi` but additionally expects a synchronous
 * `session` accessor — Pi exposes the session id through `pi.session` once
 * the host registration has begun, which is when an extension factory runs.
 */
export interface DefinePiCapabilityHostExtensionApi extends PiCapabilityExtensionApi {
  readonly session?: { readonly sessionId: string };
  /** Pi's extension host may provide additional lifecycle hooks; declared
   *  here so the helper stays compatible with whatever Pi emits next. */
  readonly on?: (event: 'session_start', handler: (event: unknown, context: { sessionManager: { getSessionId(): string } }) => void) => void;
}

/**
 * Self-publish a capability host and call `options.register` synchronously
 * with the bound providers. Use this inside an extension factory in place of
 * the older `registerPiCapabilityHost` consumer pattern.
 *
 * Two execution paths:
 *
 *   1. **Synchronous** — when `pi.session.sessionId` is already available
 *      (typical Pi flow: extensions load after session is created). The host
 *      is published before `register` is called, so any tool that synchronously
 *      `resolvePiCapabilityHost`s the same package during `register` sees it.
 *   2. **Deferred** — when no session id is available yet (extensions loaded
 *      before session creation). The helper waits for `session_start`, then
 *      publishes and calls `register`.
 *
 * The handler is registered on `PI_CAPABILITY_RESOLVE_CHANNEL` for the entire
 * session lifetime; extensions are unloaded when Pi disposes the session.
 */
export function definePiCapabilityHost<TProviders extends Record<string, unknown>>(
  pi: DefinePiCapabilityHostExtensionApi,
  options: DefinePiCapabilityHostOptions<TProviders>,
): () => void {
  const contract = options.contract ?? 'upup.pi.host.v1';
  const createHost = (sessionId: string, providers: Record<string, unknown>): PiCapabilityHostRecord => {
    if (!sessionId.trim()) throw new Error(`Pi capability host '${options.packageName}' requires a non-empty sessionId`);
    return {
      contract,
      packageName: options.packageName,
      packageVersion: options.packageVersion,
      sessionId,
      capabilities: [...options.capabilities],
      providers,
    };
  };
  // Sprint D Phase 2: register the resolve handler IMMEDIATELY. We do
  // NOT wait for `session_start` because in real Pi flows extensions are
  // loaded AFTER the session is created — by the time the factory runs,
  // session_start has already fired and waiting for it would deadlock the
  // resolution.
  //
  // The handler reads providers from the store on every resolve call, so
  // the orchestrator can populate the store either before or after the
  // extension loads — both orderings work.
  //
  // Back-compat for legacy `registerPiCapabilityHost` callers (which pass
  // `sessionId: undefined` when probing): we accept undefined and look up
  // the store for ANY session that has the package entry. This is safe
  // because the legacy path is only used during extension load before
  // session_start has dispatched a session-specific id.
  const localSessionId = pi.session?.sessionId;
  const handler = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const request = value as { packageName?: unknown; sessionId?: unknown; resolve?: (host: PiCapabilityHostRecord | undefined) => void };
    if (request.packageName !== options.packageName || typeof request.resolve !== 'function') return;
    // Filter on sessionId: if the extension has a local session id, only
    // respond to requests for that session. Otherwise (no local id) we
    // accept any session id from the request, or fall back to scanning
    // the store for the first session that has this package.
    let requestSessionId = typeof request.sessionId === 'string' ? request.sessionId : undefined;
    if (localSessionId) {
      if (requestSessionId && requestSessionId !== localSessionId) return;
      requestSessionId = localSessionId;
    }
    let providers: Record<string, unknown> = options.providers as Record<string, unknown>;
    let resolvedSessionId = localSessionId ?? 'standalone';
    if (requestSessionId) {
      const storeEntry = _sessionProvidersAccessor?.getSessionProviders(requestSessionId)?.[options.packageName];
      providers = (storeEntry?.providers ?? options.providers) as Record<string, unknown>;
      resolvedSessionId = requestSessionId;
    } else {
      // No session id available: scan the store for the first session
      // that has this package. This handles the legacy pattern where
      // registerPiCapabilityHost probes without a session id.
      let found = false;
      for (const sid of _sessionProvidersAccessor?.listSessionProvidersKeys() ?? []) {
        const entry = _sessionProvidersAccessor?.getSessionProviders(sid)?.[options.packageName];
        if (entry) {
          providers = (entry.providers ?? options.providers) as Record<string, unknown>;
          resolvedSessionId = sid;
          found = true;
          break;
        }
      }
      if (!found) {
        // No session has published this package; use metadata-only fallback.
        providers = options.providers as Record<string, unknown>;
      }
    }
    request.resolve(createHost(resolvedSessionId, providers));
  };
  pi.events.on(PI_CAPABILITY_RESOLVE_CHANNEL, handler);
  if (localSessionId) {
    options.register({ sessionId: localSessionId, providers: options.providers });
    return () => {};
  }
  // No session id at registration time (test stub or deferred bootstrap).
  // Still register the user callback — it will fire when session_start
  // arrives. If `pi.on` is unavailable, we skip the callback registration
  // but the resolve handler is still active for any future request that
  // carries a session id.
  if (typeof pi.on === 'function') {
    let registered = false;
    pi.on('session_start', (_event, context) => {
      if (registered) return;
      registered = true;
      const sessionId = context.sessionManager.getSessionId();
      options.register({ sessionId, providers: options.providers });
    });
  }
  return () => {};
}

// Sprint D Phase 2: read rich providers from the session-scoped store
// populated by agent-session-factory. Falls back to the extension's
// metadata-only `providers` when the store is empty (standalone / test usage).
// Imported lazily to avoid a hard cycle: pi-capability-registry is loaded by
// extension factories at startup, before pi-runtime has wired its index.ts.
type SessionProvidersAccessor = {
  getSessionProviders(sessionId: string): { readonly [key: string]: { readonly providers?: Record<string, unknown> } } | undefined;
  listSessionProvidersKeys(): readonly string[];
};
let _sessionProvidersAccessor: SessionProvidersAccessor | undefined;
export function bindSessionProvidersAccessor(accessor: SessionProvidersAccessor): void {
  _sessionProvidersAccessor = accessor;
}

export interface PiCapabilityExtensionApi {
  /**
   * Pi hands the concrete `ExtensionAPI` in, whose `registerTool` is generic
   * over the tool definition. Typing this parameter as `never` keeps that
   * implementation assignable: nothing in UpUp ever calls it through this
   * interface, it is only forwarded.
   */
  readonly registerTool: (tool: never) => void;
  readonly events: PiCapabilityEventBus;
  /**
   * Narrowed to the single lifecycle event this registry subscribes to, so the
   * concrete `ExtensionAPI` (whose `on` is an overload set over literal event
   * names) stays assignable.
   */
  readonly on?: (event: 'session_start', handler: (event: unknown, context: { sessionManager: { getSessionId(): string } }) => void) => void;
}

export function registerPiCapabilityHost<T extends PiCapabilityHostShape & { providers?: unknown }>(
  pi: PiCapabilityExtensionApi,
  packageName: string,
  register: (host: { readonly contract: T['contract']; readonly packageName: T['packageName']; readonly packageVersion: T['packageVersion']; readonly sessionId: T['sessionId']; readonly capabilities: T['capabilities']; readonly providers: Record<string, any> }) => void,
): void {
  let registered: T | undefined;
  const bind = (host: T | undefined): void => {
    if (!host || host === registered) return;
    registered = host;
    register(host as unknown as { readonly contract: T['contract']; readonly packageName: T['packageName']; readonly packageVersion: T['packageVersion']; readonly sessionId: T['sessionId']; readonly capabilities: T['capabilities']; readonly providers: Record<string, any> });
  };
  bind(resolvePiCapabilityHost<T>(pi.events, packageName, undefined));
  if (typeof pi.on === 'function') {
    pi.on('session_start', (_event, context) => {
      bind(resolvePiCapabilityHost<T>(pi.events, packageName, context.sessionManager.getSessionId()));
    });
  }
}

export function resolvePiCapabilityHost<T extends PiCapabilityHostShape & { providers?: unknown } = PiCapabilityHostRecord>(
  events: PiCapabilityEventBus,
  packageName: string,
  sessionId: string | undefined,
): T | undefined {
  let resolved: T | undefined;
  events.emit(PI_CAPABILITY_RESOLVE_CHANNEL, {
    packageName,
    sessionId,
    resolve: (host: PiCapabilityHostRecord | undefined) => { resolved = host as T | undefined; },
  });
  return resolved;
}

export function publishPiCapabilityHosts(
  events: PiCapabilityEventBus,
  sessionId: string,
  hosts: ReadonlyMap<string, PiCapabilityHostRecord>,
): () => void {
  for (const [packageName, host] of hosts) {
    if (host.packageName !== packageName || host.sessionId !== sessionId) throw new Error(`Pi capability host identity mismatch: ${packageName}`);
  }
  const handler = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const request = value as { packageName?: unknown; sessionId?: unknown; resolve?: (host: PiCapabilityHostRecord | undefined) => void };
    if (request.packageName !== undefined && typeof request.resolve === 'function' && (request.sessionId === undefined || request.sessionId === sessionId)) {
      request.resolve(hosts.get(request.packageName as string));
    }
  };
  return events.on(PI_CAPABILITY_RESOLVE_CHANNEL, handler);
}
