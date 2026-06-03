/**
 * IS (Implementation Shortfall) Algorithm
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: Implementation Shortfall
 *
 * Adjusts participation rate based on how far price has moved from the
 * arrival (reference) price: increases rate when price moves AWAY from
 * arrival (urgency to complete) and decreases when price moves TOWARDS
 * arrival (patient, can wait for better fill).
 *
 * For a BUY: price > arrival = adverse → trade faster.
 *            price < arrival = favorable → trade slower.
 * For a SELL: the inverse.
 *
 * The algo produces a schedule with a base TWAP-style distribution, then
 * the runner applies the IS adjustment just before submission via the
 * `quantityResolver` hook (mirroring POV's pattern).
 */

import type { Algo, ChildOrder, ParentOrder, TradingSessionWindow } from './types.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';
import { TwapAlgo } from './twap.js';

const MIN_PARTICIPATION = 0.25; // never go below 25% of base
const MAX_PARTICIPATION = 4.0;  // never go above 4x base
const ADVERSE_THRESHOLD_BPS = 50; // 0.5%

interface IsParams {
  /** Override the base schedule interval. Default 60s. */
  baseIntervalMs?: number;
}

function expandSessionMinutes(
  startMs: number,
  endMs: number,
  window: TradingSessionWindow,
): Array<{ openMs: number; closeMs: number }> {
  const out: Array<{ openMs: number; closeMs: number }> = [];
  for (let day = new Date(startMs); day.getTime() < endMs; day = nextDay(day)) {
    for (const session of window.sessions) {
      const open = atTimeOn(day, session.start, window.timezone ?? 'Asia/Shanghai');
      const close = atTimeOn(day, session.end, window.timezone ?? 'Asia/Shanghai');
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

/**
 * Compute the IS multiplier given arrival price, current price, and side.
 * Returns a value in [MIN_PARTICIPATION, MAX_PARTICIPATION].
 */
export function isMultiplier(arrivalPrice: number, currentPrice: number, side: 'buy' | 'sell'): number {
  if (arrivalPrice <= 0 || currentPrice <= 0) return 1;
  // Adverse move: for buy, price > arrival; for sell, price < arrival.
  const adverseBps = side === 'buy'
    ? ((currentPrice - arrivalPrice) / arrivalPrice) * 10_000
    : ((arrivalPrice - currentPrice) / arrivalPrice) * 10_000;
  if (adverseBps <= 0) {
    // Favorable — slow down. Scale within [MIN, 1.0].
    const favorableRatio = Math.min(1, -adverseBps / ADVERSE_THRESHOLD_BPS);
    return 1 - favorableRatio * (1 - MIN_PARTICIPATION);
  }
  // Adverse — speed up. Scale within [1.0, MAX].
  const adverseRatio = Math.min(1, adverseBps / ADVERSE_THRESHOLD_BPS);
  return 1 + adverseRatio * (MAX_PARTICIPATION - 1);
}

export class IsAlgo implements Algo {
  readonly kind = 'is' as const;
  private readonly baseTwap: TwapAlgo;

  constructor(options?: { baseIntervalMs?: number }) {
    this.baseTwap = new TwapAlgo({ defaultIntervalMs: options?.baseIntervalMs ?? 60_000 });
  }

  schedule(parent: ParentOrder): ChildOrder[] {
    // Defer to TWAP for the base schedule. The runner applies IS
    // multiplier via quantityResolver (or via runner enhancement that
    // reads child metadata). For deterministic schedule generation,
    // quantities are base-sized.
    return this.baseTwap.schedule(parent);
  }
}

// Suppress lint warning for unused expansion helper — kept for future
// enhancement where the IS algo will accept a session override and
// compute its own schedule.
void expandSessionMinutes;
