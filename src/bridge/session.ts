import { randomBytes } from 'node:crypto';

export type SessionStatus = 'idle' | 'thinking' | 'tool' | 'done';

export interface BridgeSession {
  id: string;
  clientId: string;
  status: SessionStatus;
  history: Array<{ kind: string; payload: unknown; at: number }>;
  createdAt: number;
  updatedAt: number;
}

export class BridgeSessionStore {
  private readonly byId = new Map<string, BridgeSession>();

  start(clientId: string): BridgeSession {
    const now = Date.now();
    const s: BridgeSession = {
      id: randomBytes(12).toString('base64url'),
      clientId,
      status: 'idle',
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(s.id, s);
    return s;
  }

  attach(id: string, clientId: string): BridgeSession | null {
    const s = this.byId.get(id);
    if (!s) return null;
    s.clientId = clientId;
    s.updatedAt = Date.now();
    return s;
  }

  handoff(id: string, newClientId: string): BridgeSession | null {
    const s = this.byId.get(id);
    if (!s) return null;
    s.clientId = newClientId;
    s.status = 'idle';
    s.updatedAt = Date.now();
    return s;
  }

  get(id: string): BridgeSession | undefined {
    return this.byId.get(id);
  }

  update(id: string, patch: Partial<Pick<BridgeSession, 'status'>>): BridgeSession | null {
    const s = this.byId.get(id);
    if (!s) return null;
    if (patch.status) s.status = patch.status;
    s.updatedAt = Date.now();
    return s;
  }

  recordEvent(id: string, kind: string, payload: unknown): void {
    const s = this.byId.get(id);
    if (!s) return;
    s.history.push({ kind, payload, at: Date.now() });
    s.updatedAt = Date.now();
  }

  shutdown(id: string): void {
    this.byId.delete(id);
  }

  list(): BridgeSession[] {
    return [...this.byId.values()];
  }
}
