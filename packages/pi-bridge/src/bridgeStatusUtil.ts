/**
 * Bridge status state machine + display utilities.
 *
 * States (lifecycle of a single bridge session):
 *   idle          — server connected, no active session
 *   attached      — session bound, awaiting first user message
 *   titled        — session has produced a title (UI shows it)
 *   reconnecting  — transport dropped, attempting re-attach
 *   failed        — terminal error state, requires explicit reset
 *
 * State transitions are validated against VALID_TRANSITIONS; invalid
 * transitions throw so callers don't silently corrupt the UI state.
 */

/** Bridge status state machine states. */
export type StatusState =
  | 'idle'
  | 'attached'
  | 'titled'
  | 'reconnecting'
  | 'failed';

/** How long a tool activity line stays visible after last tool_start (ms). */
export const TOOL_DISPLAY_EXPIRY_MS = 30_000;

const VALID_TRANSITIONS: Record<StatusState, readonly StatusState[]> = {
  idle: ['attached', 'reconnecting', 'failed'],
  attached: ['titled', 'reconnecting', 'failed', 'idle'],
  titled: ['reconnecting', 'failed', 'idle', 'attached'],
  reconnecting: ['attached', 'failed', 'idle'],
  failed: ['idle'],
};

/** Returns true if `from → to` is a permitted status transition. */
export function canTransition(from: StatusState, to: StatusState): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

/** List of permitted transitions from a given state. */
export function nextStates(from: StatusState): readonly StatusState[] {
  return VALID_TRANSITIONS[from];
}

export interface BridgeStatusSnapshot {
  state: StatusState;
  lastTransitionAt: number;
  lastToolStartAt: number;
  toolDisplayActive: boolean;
}

/** Mutable tracker for a single bridge session's UI state. */
export class BridgeStatusTracker {
  private _state: StatusState = 'idle';
  private _lastToolStart = 0;
  private _lastTransition = Date.now();

  get state(): StatusState {
    return this._state;
  }

  get lastTransitionAt(): number {
    return this._lastTransition;
  }

  get lastToolStartAt(): number {
    return this._lastToolStart;
  }

  transition(to: StatusState): void {
    if (!canTransition(this._state, to)) {
      throw new Error(
        `bridge.status: invalid transition ${this._state} → ${to}`,
      );
    }
    this._state = to;
    this._lastTransition = Date.now();
  }

  /** Mark a tool as having just started. Resets the display-expiry timer. */
  markToolStart(): void {
    this._lastToolStart = Date.now();
  }

  /** True iff a tool activity line is still within TOOL_DISPLAY_EXPIRY_MS. */
  isToolDisplayActive(): boolean {
    if (this._lastToolStart === 0) return false;
    return Date.now() - this._lastToolStart < TOOL_DISPLAY_EXPIRY_MS;
  }

  /** Time elapsed since last tool_start (ms), or 0 if none. */
  toolDisplayAgeMs(): number {
    if (this._lastToolStart === 0) return 0;
    return Date.now() - this._lastToolStart;
  }

  snapshot(): BridgeStatusSnapshot {
    return {
      state: this._state,
      lastTransitionAt: this._lastTransition,
      lastToolStartAt: this._lastToolStart,
      toolDisplayActive: this.isToolDisplayActive(),
    };
  }

  /** Reset to idle (e.g. after a failed → idle recovery). */
  reset(): void {
    this._state = 'idle';
    this._lastToolStart = 0;
    this._lastTransition = Date.now();
  }
}

/**
 * Abbreviate a tool activity summary for the trail display. Uses
 * U+2026 horizontal ellipsis to indicate truncation.
 */
export function abbreviateActivity(summary: string, maxWidth = 30): string {
  if (maxWidth <= 0) return '';
  if (summary.length <= maxWidth) return summary;
  if (maxWidth <= 1) return summary.slice(0, maxWidth);
  return summary.slice(0, maxWidth - 1) + '\u2026';
}

/** Format current time as HH:MM:SS in local timezone. */
export function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
