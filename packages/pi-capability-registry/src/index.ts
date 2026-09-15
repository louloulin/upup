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

export function registerPiCapabilityHost<T extends PiCapabilityHostRecord>(
  pi: PiCapabilityExtensionApi,
  packageName: string,
  register: (host: T) => void,
): void {
  let registered: T | undefined;
  const bind = (host: T | undefined): void => {
    if (!host || host === registered) return;
    registered = host;
    register(host);
  };
  bind(resolvePiCapabilityHost<T>(pi.events, packageName, undefined));
  if (typeof pi.on === 'function') {
    pi.on('session_start', (_event, context) => {
      bind(resolvePiCapabilityHost<T>(pi.events, packageName, context.sessionManager.getSessionId()));
    });
  }
}

export function resolvePiCapabilityHost<T extends PiCapabilityHostRecord = PiCapabilityHostRecord>(
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
