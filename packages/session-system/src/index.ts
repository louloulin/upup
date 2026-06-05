/**
 * @upup/session-system - L4 Session Management
 *
 * Session lifecycle, persistence, and migration.
 * Replaces src/session/.
 */

export interface SessionMetadata {
  id: string;
  createdAt: number;
  updatedAt: number;
  channel?: string;
  userId?: string;
  model?: string;
  title?: string;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
}

export interface Session {
  metadata: SessionMetadata;
  messages: SessionMessage[];
}

export interface SessionStore {
  get(id: string): Promise<Session | null>;
  put(id: string, session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<SessionMetadata[]>;
}

let _store: SessionStore | null = null;
export function getSessionStore(): SessionStore {
  if (!_store) {
    _store = {
      async get() { return null; },
      async put() {},
      async delete() {},
      async list() { return []; },
    };
  }
  return _store;
}

export function getSessionTracker() {
  return {
    track(_id: string): void {},
    untrack(_id: string): void {},
    getActive(): string[] { return []; },
  };
}

export async function migrateSessions(_fromDir: string, _toDir: string): Promise<number> {
  return 0;
}
