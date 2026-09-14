import type { UpUpAgentSession } from '@upup/pi-runtime';

export interface PiRunnerSessionState {
  session: UpUpAgentSession;
  tail: Promise<void>;
  running: boolean;
  specHash: string;
}

export interface PiSessionInitialization {
  specHash: string;
  promise: Promise<PiRunnerSessionState>;
}

/** Session-keyed runner state owned by one PiSessionService composition. */
export class PiSessionRegistry {
  private readonly sessions = new Map<string, PiRunnerSessionState>();
  private readonly sessionInitializations = new Map<string, PiSessionInitialization>();

  get(sessionKey: string): PiRunnerSessionState | undefined { return this.sessions.get(sessionKey); }
  set(sessionKey: string, state: PiRunnerSessionState): void { this.sessions.set(sessionKey, state); }
  getInitialization(sessionKey: string): PiSessionInitialization | undefined { return this.sessionInitializations.get(sessionKey); }
  setInitialization(sessionKey: string, initialization: PiSessionInitialization): void { this.sessionInitializations.set(sessionKey, initialization); }
  clearInitialization(sessionKey: string, promise: Promise<PiRunnerSessionState>): void {
    if (this.sessionInitializations.get(sessionKey)?.promise === promise) this.sessionInitializations.delete(sessionKey);
  }
  isRunning(sessionKey: string): boolean { return this.sessions.get(sessionKey)?.running ?? false; }
  getTools(sessionKey: string): readonly { name: string; description: string }[] {
    const state = this.sessions.get(sessionKey);
    return state ? state.session.getAvailableToolNames().map((name) => ({ name, description: name })) : [];
  }
  dispose(): void {
    for (const state of this.sessions.values()) state.session.dispose();
    this.sessions.clear();
    this.sessionInitializations.clear();
  }
}
