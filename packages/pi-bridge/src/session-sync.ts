// Cross-device session state sharing for the bridge.
// Pure functions (serialize/deserialize/hash) + SessionSync class (disk I/O).
// See Design Doc Sprint 1.5 session-sync spec for the 4 sub-requirements.
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export type SessionStatus = 'idle' | 'thinking' | 'tool' | 'done';

export interface SessionState {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  clientId: string;
  status: SessionStatus;
  history: Array<{ kind: string; payload: unknown; at: number }>;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; at: number }>;
  toolHistory: Array<{ tool: string; args: unknown; result: string; at: number }>;
  scratchpad: string;
  featureGates: Record<string, boolean>;
  metadata: {
    resumedAt?: number;
    resumedFromDevice?: string;
    resumedCount?: number;
  };
}

const MAX_BLOB_BYTES = 1024 * 1024; // 1MB per spec

function truncateBlob(s: string): string {
  const bytes = Buffer.byteLength(s, 'utf8');
  if (bytes <= MAX_BLOB_BYTES) return s;
  const truncated = s.slice(0, MAX_BLOB_BYTES);
  return `[truncated: originalSize=${bytes}, keptSize=${MAX_BLOB_BYTES}]\n${truncated}`;
}

/**
 * Stable JSON: sort object keys recursively so two equivalent SessionStates
 * always serialize to byte-identical output (array order preserved).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function serializeSession(state: SessionState): string {
  const safe: SessionState = { ...state, scratchpad: truncateBlob(state.scratchpad) };
  return stableStringify(safe);
}

export function deserializeSession(json: string): SessionState {
  const parsed = JSON.parse(json) as SessionState;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('session-sync: bad snapshot (not an object)');
  }
  if (typeof parsed.sessionId !== 'string') {
    throw new Error('session-sync: bad snapshot (missing sessionId)');
  }
  return parsed;
}

export function sessionHash(state: SessionState): string {
  return createHash('sha256').update(serializeSession(state)).digest('hex');
}


// ---------------------------------------------------------------------------
// SessionSync class — disk persistence layer
// ---------------------------------------------------------------------------
import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
// join is imported at the top of the file.

export interface SessionSyncOptions {
  storageDir: string;
  /** Called when a conflict is resolved. Bus wiring comes in Sprint 2.3. */
  onConflictResolved?: (e: { sessionId: string; winner: 'local' | 'remote'; loserPath: string }) => void;
}

export class SessionSync {
  private readonly dir: string;
  private readonly onConflictResolved?: SessionSyncOptions['onConflictResolved'];

  constructor(opts: SessionSyncOptions) {
    this.dir = opts.storageDir;
    this.onConflictResolved = opts.onConflictResolved;
  }

  private pathFor(sessionId: string): string {
    return join(this.dir, `${sanitize(sessionId)}.json`);
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const raw = await readFile(this.pathFor(sessionId), 'utf8');
      return deserializeSession(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async save(state: SessionState): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = this.pathFor(state.sessionId);
    const tmp = `${path}.tmp`;
    await writeFile(tmp, serializeSession(state), 'utf8');
    await rename(tmp, path);
  }

  /**
   * Resume a persisted snapshot, stamping resumedAt + resumedFromDevice.
   * Returns null if no snapshot exists.
   */
  async resume(sessionId: string, fromDevice: string): Promise<SessionState | null> {
    const existing = await this.load(sessionId);
    if (!existing) return null;
    const next: SessionState = {
      ...existing,
      updatedAt: Date.now(),
      metadata: {
        ...existing.metadata,
        resumedAt: Date.now(),
        resumedFromDevice: fromDevice,
        resumedCount: (existing.metadata.resumedCount ?? 0) + 1,
      },
    };
    // Persist the resume metadata back to disk so subsequent resumes see
    // the incremented count (spec: "persist after every meaningful state
    // change"; resume qualifies).
    await this.save(next);
    return next;
  }

  /**
   * Merge two snapshots with last-writer-wins. Loser is archived to a
   * .conflict-<timestamp>.json file. Equality on updatedAt → remote wins.
   */
  async mergeWithBackup(
    local: SessionState,
    remote: SessionState,
  ): Promise<{ winner: SessionState; loserPath: string }> {
    if (local.sessionId !== remote.sessionId) {
      throw new Error('session-sync.merge: sessionId mismatch');
    }
    const localWins = local.updatedAt > remote.updatedAt;
    const winner = localWins ? local : remote;
    const loser = localWins ? remote : local;
    const ts = Date.now();
    const loserPath = join(this.dir, `${sanitize(winner.sessionId)}.conflict-${ts}.json`);
    await writeFile(loserPath, serializeSession(loser), 'utf8');
    this.onConflictResolved?.({
      sessionId: winner.sessionId,
      winner: localWins ? 'local' : 'remote',
      loserPath,
    });
    return { winner, loserPath };
  }

  /** List all session ids (excluding conflict files) for the bridge UI. */
  async list(): Promise<string[]> {
    try {
      const files = await readdir(this.dir);
      return files
        .filter((f) => f.endsWith('.json') && !f.includes('.conflict-'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }
}

function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_');
}
