/**
 * VWAP (Volume-Weighted Average Price) Algorithm
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: VWAP Algorithm
 *
 * Splits a parent order into child orders weighted by the historical
 * intraday volume distribution. The volume profile is supplied via
 * `parent.params.volumeProfile` as `number[]` indexed by minute-of-day
 * (e.g. 240 entries for a 4-hour trading day), or as a callback
 * `(minuteOfDay: number) => number`. If neither is provided, VWAP
 * falls back to a U-shaped default that mirrors the typical A-share
 * intraday pattern (volume concentration at open and close).
 */

import type { Algo, ChildOrder, ParentOrder, TradingSessionWindow } from './types.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';

const MINUTES_PER_DAY = 24 * 60;

/**
 * Default A-share U-shaped volume curve, sampled per minute across the
 * 4-hour (240-minute) trading day. Heavier weight at 09:30-09:45 and
 * 14:30-15:00; lighter weight in the middle of the day.
 */
function defaultVolumeProfile(): number[] {
  const out: number[] = [];
  for (let m = 0; m < MINUTES_PER_DAY; m++) out.push(1);
  // Heavier open
  for (let m = 0; m < 15; m++) out[m] = 3.5;
  // Heavier close
  for (let m = 225; m < 240; m++) out[m] = 3.0;
  return out;
}

interface ExpandedMinute {
  openMs: number;
  closeMs: number;
  /** Index into the 240-minute intraday volume profile. */
  profileIndex: number;
}

/**
 * Expand a parent's duration into per-minute slots, tracking the profile
 * index (0..239) so morning session maps to 0..(morningMinutes-1) and
 * afternoon session maps to morningMinutes..239. The profile index is
 * offset-from-session-open, not global minute-of-day, so a profile of
 * length 240 covers the standard 4-hour A-share trading day.
 */
function expandSessionMinutes(
  startMs: number,
  endMs: number,
  window: TradingSessionWindow,
): ExpandedMinute[] {
  const out: ExpandedMinute[] = [];
  const tz = window.timezone ?? 'Asia/Shanghai';
  // Sum of minutes in sessions BEFORE each session index (cumulative base).
  let cumulativeMinutes = 0;
  const sessionBases: number[] = [];
  for (const session of window.sessions) {
    sessionBases.push(cumulativeMinutes);
    const [sh, sm] = session.start.split(':').map(Number);
    const [eh, em] = session.end.split(':').map(Number);
    cumulativeMinutes += (eh * 60 + em) - (sh * 60 + sm);
  }
  for (let day = new Date(startMs); day.getTime() < endMs; day = nextDay(day)) {
    for (let sIdx = 0; sIdx < window.sessions.length; sIdx++) {
      const session = window.sessions[sIdx]!;
      const baseIdx = sessionBases[sIdx]!;
      const open = atTimeOn(day, session.start, tz);
      const close = atTimeOn(day, session.end, tz);
      const segStart = Math.max(open, startMs);
      const segEnd = Math.min(close, endMs);
      if (segEnd <= segStart) continue;
      for (let t = segStart; t < segEnd; t += 60_000) {
        const minutesFromSessionOpen = Math.floor((t - open) / 60_000);
        out.push({
          openMs: t,
          closeMs: Math.min(t + 60_000, segEnd),
          profileIndex: baseIdx + minutesFromSessionOpen,
        });
      }
    }
  }
  return out;
}

function nextDay(d: Date): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + 1);
  n.setUTCHours(0, 0, 0, 0);
  return n;
}

function atTimeOn(day: Date, hhmm: string, tz: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
  }).formatToParts(day);
  const get = (t: string) => Number(dateParts.find(p => p.type === t)?.value);
  const y = get('year');
  const mo = get('month') - 1;
  const d = get('day');
  const localAsUtc = Date.UTC(y, mo, d, h, m, 0, 0);
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(localAsUtc));
  const tzH = Number(offsetParts.find(p => p.type === 'hour')?.value);
  const tzM = Number(offsetParts.find(p => p.type === 'minute')?.value);
  const offsetMs = (tzH - h) * 3_600_000 + (tzM - m) * 60_000;
  return localAsUtc - offsetMs;
}

export class VwapAlgo implements Algo {
  readonly kind = 'vwap' as const;
  private readonly profile: number[];

  constructor(options?: { volumeProfile?: number[] }) {
    this.profile = options?.volumeProfile ?? defaultVolumeProfile();
  }

  schedule(parent: ParentOrder): ChildOrder[] {
    const window = parent.session ?? DEFAULT_A_SHARE_SESSIONS;
    const minutes = expandSessionMinutes(
      parent.duration.startMs, parent.duration.endMs, window,
    );
    if (minutes.length === 0 || parent.quantity <= 0) return [];

    // Compute total weight across the parent's window.
    let totalWeight = 0;
    const weights: number[] = [];
    for (const m of minutes) {
      const w = this.profile[m.profileIndex % this.profile.length] ?? 1;
      weights.push(Math.max(0, w));
      totalWeight += Math.max(0, w);
    }
    if (totalWeight <= 0) return [];

    const minQty = parent.minChildQuantity ?? 1;
    const maxQty = parent.maxChildQuantity ?? Infinity;

    let remaining = parent.quantity;
    const schedule: ChildOrder[] = [];

    for (let i = 0; i < minutes.length; i++) {
      const w = weights[i] ?? 0;
      if (w <= 0) continue;
      // Push any rounding remainder to the LAST child for the parent.
      let qty = (i === minutes.length - 1)
        ? remaining
        : Math.floor((w / totalWeight) * parent.quantity);
      qty = Math.min(qty, remaining);
      if (qty < minQty) {
        // Merge into last actually-emitted child. We must also decrement
        // `remaining` by the merged qty so the LAST-child remainder
        // doesn't double-count the merged shares.
        const prev = schedule[schedule.length - 1];
        if (prev) {
          prev.quantity += qty;
          remaining -= qty;
        }
        // If no previous child exists (e.g. very first child is below
        // minQty), emit it anyway as a forced small child to avoid
        // losing shares.
        if (!prev && qty > 0) {
          schedule.push({
            sequence: schedule.length,
            scheduledAtMs: minutes[i]!.openMs,
            quantity: qty,
          });
          remaining -= qty;
        }
        continue;
      }
      qty = Math.min(qty, maxQty);
      if (qty <= 0) continue;

      schedule.push({
        sequence: schedule.length,
        scheduledAtMs: minutes[i]!.openMs,
        quantity: qty,
      });
      remaining -= qty;
      if (remaining <= 0) break;
    }

    return schedule;
  }
}
