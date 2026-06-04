/**
 * Proactive state machine — 6-property runtime state for the KAIROS
 * proactive opportunity discovery engine.
 *
 * The state is composed of 6 orthogonal properties (not a single
 * state-machine state) so each can be queried/set independently:
 *
 *   1. active           — is proactive mode running at all
 *   2. paused           — is it temporarily suspended (vs deactivated)
 *   3. contextBlocked   — is there an in-flight user interaction that
 *                          should not be interrupted
 *   4. nextTickAt       — when the next scheduled scan should run (ms epoch)
 *   5. source           — where the activation came from (for diagnostics)
 *   6. listeners        — Set of subscribers notified on every state change
 *
 * The KAIROS scanner consults `isProactiveActive() && !isProactivePaused()
 * && !isProactiveContextBlocked()` before running a scan. The
 * `resolveAutonomyMode` helper turns the 3-input config (assistant
 * enabled, user setting, env var) into one of 4 autonomy modes.
 *
 * The state machine is purely in-memory; persistence is the caller's
 * responsibility (typically .upup/settings.json).
 */

export type ProactiveSource =
  | 'cli-flag'
  | 'env-var'
  | 'user-setting'
  | 'feature-gate'
  | 'system-default'
  | 'runtime';

export type AutonomyMode = 'disabled' | 'passive' | 'proactive' | 'manual';

export interface ProactiveSnapshot {
  active: boolean;
  paused: boolean;
  contextBlocked: boolean;
  nextTickAt: number | null;
  source: ProactiveSource | null;
  listenerCount: number;
}

export type ProactiveListener = (snap: ProactiveSnapshot, prev: ProactiveSnapshot) => void;

/** Validate that a string is a known ProactiveSource. */
export function isProactiveSource(s: string): s is ProactiveSource {
  return (
    s === 'cli-flag' ||
    s === 'env-var' ||
    s === 'user-setting' ||
    s === 'feature-gate' ||
    s === 'system-default' ||
    s === 'runtime'
  );
}

export class ProactiveStateError extends Error {
  constructor(message: string) {
    super(`proactiveState: ${message}`);
    this.name = 'ProactiveStateError';
  }
}

export class ProactiveState {
  private _active = false;
  private _paused = false;
  private _contextBlocked = false;
  private _nextTickAt: number | null = null;
  private _source: ProactiveSource | null = null;
  private _listeners = new Set<ProactiveListener>();

  // ─── Activation lifecycle ───────────────────────────────────────────

  /** Activate proactive mode. Throws if already active. */
  activate(source: ProactiveSource): void {
    if (!isProactiveSource(source)) {
      throw new ProactiveStateError(`unknown source "${source}"`);
    }
    if (this._active) {
      throw new ProactiveStateError(`already active (source: ${this._source})`);
    }
    const prev = this.snapshot();
    this._active = true;
    this._paused = false;
    this._source = source;
    this.emit(prev);
  }

  /** Deactivate proactive mode. No-op if already inactive. */
  deactivate(): void {
    if (!this._active) return;
    const prev = this.snapshot();
    this._active = false;
    this._paused = false;
    this._nextTickAt = null;
    this._source = null;
    this.emit(prev);
  }

  /** Pause an active proactive. Throws if not active. */
  pause(): void {
    if (!this._active) {
      throw new ProactiveStateError('cannot pause: not active');
    }
    if (this._paused) return;
    const prev = this.snapshot();
    this._paused = true;
    this.emit(prev);
  }

  /** Resume a paused proactive. Throws if not active. */
  resume(): void {
    if (!this._active) {
      throw new ProactiveStateError('cannot resume: not active');
    }
    if (!this._paused) return;
    const prev = this.snapshot();
    this._paused = false;
    this.emit(prev);
  }

  // ─── Context-block + scheduling ─────────────────────────────────────

  /** Mark whether an in-flight user interaction should block proactive. */
  setContextBlocked(blocked: boolean): void {
    if (typeof blocked !== 'boolean') {
      throw new ProactiveStateError('setContextBlocked: value must be boolean');
    }
    if (this._contextBlocked === blocked) return;
    const prev = this.snapshot();
    this._contextBlocked = blocked;
    this.emit(prev);
  }

  /** Schedule the next tick (ms epoch). Pass null to clear. */
  setNextTickAt(t: number | null): void {
    if (t !== null && (typeof t !== 'number' || !Number.isFinite(t))) {
      throw new ProactiveStateError('setNextTickAt: t must be a finite number or null');
    }
    if (this._nextTickAt === t) return;
    const prev = this.snapshot();
    this._nextTickAt = t;
    this.emit(prev);
  }

  getNextTickAt(): number | null {
    return this._nextTickAt;
  }

  // ─── Queries ────────────────────────────────────────────────────────

  isActive(): boolean {
    return this._active;
  }

  isPaused(): boolean {
    return this._paused;
  }

  isContextBlocked(): boolean {
    return this._contextBlocked;
  }

  getSource(): ProactiveSource | null {
    return this._source;
  }

  /**
   * The scanner gate: true iff proactive should run right now.
   * Combines active + !paused + !contextBlocked.
   */
  shouldRun(): boolean {
    return this._active && !this._paused && !this._contextBlocked;
  }

  // ─── Listeners ──────────────────────────────────────────────────────

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: ProactiveListener): () => void {
    if (typeof listener !== 'function') {
      throw new ProactiveStateError('subscribe: listener must be a function');
    }
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /** Number of registered listeners (exposed for snapshot/test). */
  listenerCount(): number {
    return this._listeners.size;
  }

  // ─── Snapshot ───────────────────────────────────────────────────────

  snapshot(): ProactiveSnapshot {
    return {
      active: this._active,
      paused: this._paused,
      contextBlocked: this._contextBlocked,
      nextTickAt: this._nextTickAt,
      source: this._source,
      listenerCount: this._listeners.size,
    };
  }

  private emit(prev: ProactiveSnapshot): void {
    if (this._listeners.size === 0) return;
    const snap = this.snapshot();
    // Iterate over a copy so listeners can unsubscribe during dispatch
    for (const listener of [...this._listeners]) {
      try {
        listener(snap, prev);
      } catch (err) {
        // Don't let one bad listener break the others
        // Best-effort: log to stderr; no logger dependency
        try {
          process.stderr.write(
            `[proactiveState] listener threw: ${(err as Error).message}\n`,
          );
        } catch {
          // ignore
        }
      }
    }
  }
}

/**
 * Resolve the final autonomy mode from 3 inputs:
 *   - assistantEnabled  — is the AI assistant enabled at the highest level
 *                         (CLI flag / config). If false, everything is off.
 *   - proactiveFlag     — explicit user setting (true/false/null).
 *                         null = no preference, defer to env.
 *   - proactiveEnv      — env var value ('true' / 'false' / null/other).
 *                         Typically UPUP_PROACTIVE.
 *
 * Returns one of:
 *   - 'disabled'  — assistant off
 *   - 'proactive' — proactive on (user or env says true)
 *   - 'passive'   — assistant on, proactive explicitly off
 *   - 'manual'    — assistant on, no proactive preference (user-driven only)
 */
export function resolveAutonomyMode(opts: {
  assistantEnabled: boolean;
  proactiveFlag: boolean | null;
  proactiveEnv: string | null;
}): AutonomyMode {
  if (!opts.assistantEnabled) return 'disabled';

  // Precedence: env > user flag > default
  const env = (opts.proactiveEnv ?? '').toLowerCase().trim();
  if (env === 'true' || env === '1' || env === 'yes' || env === 'on') return 'proactive';
  if (env === 'false' || env === '0' || env === 'no' || env === 'off') return 'passive';

  if (opts.proactiveFlag === true) return 'proactive';
  if (opts.proactiveFlag === false) return 'passive';

  return 'manual';
}

/**
 * Read the env var for proactive (typically UPUP_PROACTIVE) and return
 * 'true' / 'false' / null. Centralized so callers don't repeat the
 * env-key convention.
 */
export function readProactiveEnv(envKey: string = 'UPUP_PROACTIVE'): 'true' | 'false' | null {
  const v = process.env[envKey];
  if (v === undefined) return null;
  const lower = v.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') return 'true';
  if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') return 'false';
  return null;
}
