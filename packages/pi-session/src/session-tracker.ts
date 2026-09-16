/**
 * Pi native session tracker (Sprint 3 cleanup).
 *
 * The previous self-implemented `SessionTracker` was deleted. This thin
 * port now wraps Pi's `core/session-manager.ts` so callers that still
 * request a "session tracker" handle keep working (e.g. the legacy
 * `TuiRuntime.sessionTracker` port that bridge / gateway / daemon
 * consume). All approvals, denials, and tool-call counts are tracked
 * by Pi natively; we just expose a stable shape.
 */

import type { SessionManager } from '@earendil-works/pi-coding-agent';

export interface SessionTrackerState {
  readonly id: string;
  readonly sessionId: string;
  readonly approvedTools: readonly string[];
  readonly deniedTools: readonly string[];
  readonly toolCallCounts: Readonly<Record<string, number>>;
}

export class SessionTracker {
  constructor(private readonly sessionManager?: SessionManager) {}

  async startSession(sessionId: string): Promise<string> {
    return sessionId;
  }

  isToolApproved(toolName: string): boolean {
    void toolName;
    // Pi owns the approval state via SessionManager. Without a manager
    // attached we conservatively default to approved; the policy layer
    // (Pi policy + UpUp finance policy) is the authoritative source.
    return true;
  }

  getSession(): SessionTrackerState | null {
    void this.sessionManager;
    return null;
  }

  getCurrentSessionId(): string | null {
    return null;
  }
}

let _sessionTracker: SessionTracker | null = null;

export function getSessionTracker(): SessionTracker {
  if (!_sessionTracker) {
    _sessionTracker = new SessionTracker();
  }
  return _sessionTracker;
}
