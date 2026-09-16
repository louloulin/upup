import { SessionManager } from '@earendil-works/pi-coding-agent';
import { join, resolve } from 'node:path';
import type { UpUpAgentRuntime, UpUpAgentSession } from '@upup/pi-runtime';

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

/**
 * Process-wide Pi session service.
 *
 * Pi owns durable session state: `SessionManager` writes/reads the JSONL
 * transcript, and `AgentSession` owns tree/fork/compaction/export/crash
 * recovery. UpUp therefore keeps only the two things Pi cannot own for it:
 *
 * - the single `UpUpAgentRuntime` produced by the PiApp composition, and
 * - the session-keyed runner registry that reuses one live `AgentSession`
 *   per session key across prompts.
 *
 * Session listing, resume, rename, tag, fork, compact and export are NOT
 * re-implemented here; they go straight to Pi (`SessionManager.list`,
 * `AgentSession.fork/compact/exportToJsonl/exportToHtml`, ...).
 */
export interface PiSessionServiceFactory {
  (): UpUpAgentRuntime;
}

export interface PiSessionRuntimeService {
  readonly runtime: UpUpAgentRuntime;
  getRunnerRegistry(): PiSessionRegistry;
}

let runtimeFactory: PiSessionServiceFactory | undefined;
let service: PiSessionRuntimeService | undefined;

export function configurePiSessionService(factory: PiSessionServiceFactory): void {
  service = undefined;
  runtimeFactory = factory;
}

export async function disposePiSessionService(): Promise<void> {
  const current = service;
  service = undefined;
  runtimeFactory = undefined;
  current?.getRunnerRegistry().dispose();
}

export function getPiSessionService(): PiSessionRuntimeService {
  if (!service) {
    if (!runtimeFactory) {
      throw new Error('PiSessionService is not configured: call configurePiSessionService() with a runtime factory before getPiSessionService()');
    }
    const registry = new PiSessionRegistry();
    service = { runtime: runtimeFactory(), getRunnerRegistry: () => registry };
  }
  return service;
}

export function isPiSessionServiceConfigured(): boolean {
  return runtimeFactory !== undefined;
}

/**
 * Resolve an existing Pi session file through Pi's own session index instead of
 * scanning the session directory by hand.
 */
export async function findPiSessionFile(id: string, cwd: string, sessionDirectoryOverride?: string): Promise<string | undefined> {
  const sessionDirectory = resolve(sessionDirectoryOverride ?? join(cwd, '.upup', 'sessions'));
  const sessions = await SessionManager.list(cwd, sessionDirectory);
  return sessions.find((session) => session.id === id)?.path;
}
