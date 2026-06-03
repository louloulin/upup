/**
 * TWAP (Time-Weighted Average Price) Algorithm
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: TWAP Algorithm
 *
 * Splits a parent order into N child orders executed at uniform time
 * intervals over a user-specified duration. Children are scheduled only
 * within the configured trading session window (A-share morning + afternoon
 * by default), so a 30-minute order starting at 11:00 lands in the morning
 * session and resumes at 13:00 if it extends into the afternoon.
 */

import type { Algo, ChildOrder, ParentOrder, TradingSessionWindow } from './types.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';

// ---------------------------------------------------------------------------
// Session Helpers
// ---------------------------------------------------------------------------

/**
 * Expand a parent's duration into the actual trading-session minutes
 * available, accounting for lunch break / weekends.
 */
function sessionMinutes(
  startMs: number,
  endMs: number,
  window: TradingSessionWindow,
): Array<{ openMs: number; closeMs: number }> {
  const tz = window.timezone ?? 'Asia/Shanghai';
  const out: Array<{ openMs: number; closeMs: number }> = [];
  for (let day = new Date(startMs); day.getTime() < endMs; day = nextDay(day)) {
    for (const session of window.sessions) {
      const open = atTimeOn(day, session.start, tz);
      const close = atTimeOn(day, session.end, tz);
      const segStart = Math.max(open, startMs);
      const segEnd = Math.min(close, endMs);
      if (segEnd > segStart) out.push({ openMs: segStart, closeMs: segEnd });
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

/**
 * Compute the UTC ms timestamp that represents HH:MM in the given IANA
 * timezone on the local date of `day` (interpreted in `tz`).
 */
function atTimeOn(day: Date, hhmm: string, tz: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  // Find the local Y-M-D in tz for the given instant.
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
  }).formatToParts(day);
  const get = (t: string) => Number(dateParts.find(p => p.type === t)?.value);
  const y = get('year');
  const mo = get('month') - 1;
  const d = get('day');
  // Construct the desired local time as if it were UTC.
  const localAsUtc = Date.UTC(y, mo, d, h, m, 0, 0);
  // Find tz's offset at that instant and subtract it.
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(localAsUtc));
  const tzH = Number(offsetParts.find(p => p.type === 'hour')?.value);
  const tzM = Number(offsetParts.find(p => p.type === 'minute')?.value);
  const offsetMs = (tzH - h) * 3_600_000 + (tzM - m) * 60_000;
  return localAsUtc - offsetMs;
}

// ---------------------------------------------------------------------------
// TWAP Implementation
// ---------------------------------------------------------------------------

export class TwapAlgo implements Algo {
  readonly kind = 'twap' as const;

  /**
   * Default interval between child orders. If parent is shorter, this is
   * scaled down proportionally to fit at least 5 child orders.
   */
  private readonly defaultIntervalMs: number;

  constructor(options?: { defaultIntervalMs?: number }) {
    this.defaultIntervalMs = options?.defaultIntervalMs ?? 60_000;
  }

  schedule(parent: ParentOrder): ChildOrder[] {
    const window = parent.session ?? DEFAULT_A_SHARE_SESSIONS;
    const segments = sessionMinutes(parent.duration.startMs, parent.duration.endMs, window);
    const totalMs = segments.reduce((acc, s) => acc + (s.closeMs - s.openMs), 0);

    if (totalMs <= 0 || parent.quantity <= 0) return [];

    // Determine child count: aim for defaultIntervalMs, but ensure at least 5
    // children for non-trivial parent orders.
    const interval = Math.min(
      this.defaultIntervalMs,
      Math.max(totalMs / 5, 1_000),
    );
    const childCount = Math.max(1, Math.ceil(totalMs / interval));

    // Floor the per-child quantity so we never schedule zero-share children.
    const minQty = parent.minChildQuantity ?? 1;
    const maxQty = parent.maxChildQuantity ?? Infinity;
    let remaining = parent.quantity;
    const baseQty = Math.floor(parent.quantity / childCount);
    const schedule: ChildOrder[] = [];

    for (let i = 0; i < childCount; i++) {
      // Spread children evenly across segments (proportional to segment length)
      const slotMs = (i / childCount) * totalMs;
      const segmentIndex = findSegmentIndex(segments, slotMs);
      const segment = segments[segmentIndex];
      if (!segment) continue;
      const segmentStartSlot = segmentIndex === 0
        ? 0
        : segments.slice(0, segmentIndex).reduce((a, s) => a + (s.closeMs - s.openMs), 0);
      const offsetMs = slotMs - segmentStartSlot;
      const scheduledAtMs = segment.openMs + offsetMs;

      // Sizing: base for most, but push remainder into the last child.
      let qty = baseQty;
      if (i === childCount - 1) {
        qty = remaining;
      } else {
        qty = Math.min(qty, remaining);
      }
      if (qty < minQty) {
        // Merge into previous child (if any) by adding to the prior entry.
        const prev = schedule[schedule.length - 1];
        if (prev) prev.quantity += qty;
        continue;
      }
      qty = Math.min(qty, maxQty);
      if (qty <= 0) continue;

      schedule.push({
        sequence: i,
        scheduledAtMs,
        quantity: qty,
      });
      remaining -= qty;
      if (remaining <= 0) break;
    }

    return schedule;
  }
}

function findSegmentIndex(
  segments: Array<{ openMs: number; closeMs: number }>,
  slotMs: number,
): number {
  let cumulative = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const segLen = seg.closeMs - seg.openMs;
    if (slotMs < cumulative + segLen) return i;
    cumulative += segLen;
  }
  return segments.length - 1;
}
