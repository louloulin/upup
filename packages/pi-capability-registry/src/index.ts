export const PI_CAPABILITY_REGISTRY_CONTRACT = 'upup.pi.capability-registry.v1' as const;

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
  private activeSessionId: string | undefined;

  private selectActiveSession(preferredSessionId?: string): void {
    if (preferredSessionId && this.sessions.has(preferredSessionId)) {
      this.activeSessionId = preferredSessionId;
      return;
    }
    this.activeSessionId = [...this.sessions.keys()].at(-1);
  }

  registerSession(sessionId: string, hosts: ReadonlyMap<string, PiCapabilityHostRecord>): () => void {
    if (!sessionId.trim()) throw new Error('Pi capability session id is required');
    const sessionHosts = new Map<string, PiCapabilityHostRecord>();
    for (const [packageName, host] of hosts) {
      if (host.packageName !== packageName || host.sessionId !== sessionId) throw new Error(`Pi capability host identity mismatch: ${packageName}`);
      sessionHosts.set(packageName, host);
    }
    const previous = this.sessions.get(sessionId);
    const previousActiveSessionId = this.activeSessionId;
    this.sessions.set(sessionId, sessionHosts);
    this.activeSessionId = sessionId;
    let restored = false;
    return () => {
      if (restored) return;
      restored = true;
      if (previous) this.sessions.set(sessionId, previous);
      else this.sessions.delete(sessionId);
      this.selectActiveSession(previousActiveSessionId);
    };
  }

  disposeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) this.selectActiveSession();
  }

  resolve<T extends PiCapabilityHostRecord = PiCapabilityHostRecord>(sessionId: string | undefined, packageName: string): T | undefined {
    const effectiveSessionId = sessionId ?? this.activeSessionId;
    if (!effectiveSessionId) return undefined;
    const host = this.sessions.get(effectiveSessionId)?.get(packageName);
    if (!host || host.packageName !== packageName || host.sessionId !== effectiveSessionId || host.contract.length === 0) return undefined;
    return host as T;
  }

  has(sessionId: string | undefined, packageName: string, capability?: string): boolean {
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

export const defaultPiCapabilityRegistry = new PiCapabilityRegistry();

export interface PiCapabilityExtensionApi {
  readonly registerTool: (tool: unknown) => void;
  readonly on?: (event: string, handler: (event: unknown, context: { sessionManager: { getSessionId(): string } }) => void) => void;
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
  bind(resolvePiCapabilityHost<T>(packageName, undefined));
  if (typeof pi.on === 'function') {
    pi.on('session_start', (_event, context) => {
      bind(resolvePiCapabilityHost<T>(packageName, context.sessionManager.getSessionId()));
    });
  }
}

export function resolvePiCapabilityHost<T extends PiCapabilityHostRecord = PiCapabilityHostRecord>(
  packageName: string,
  sessionId: string | undefined,
): T | undefined {
  const explicit = defaultPiCapabilityRegistry.resolve<T>(sessionId, packageName);
  return explicit;
}
