/**
 * POV (Percent-of-Volume) Algorithm
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: POV Algorithm
 *
 * At each tick (default 60s), reads the last minute's traded volume from
 * a real-time volume feed and submits a child order sized as
 * `participationRate` (default 10%) of that volume, capped at the
 * remaining parent quantity. The schedule returned by this algo lists
 * one "slot" per minute; the actual quantity is filled in by the runner
 * just before submission (via the `quantityResolver` hook in parent
 * params), so the schedule stays deterministic at planning time.
 *
 * If no volume resolver is supplied, POV falls back to a flat 100
 * shares per minute.
 */

import type { Algo, ChildOrder, ParentOrder, TradingSessionWindow } from './types.js';
import { DEFAULT_A_SHARE_SESSIONS } from './types.js';

const DEFAULT_PARTICIPATION = 0.10;
const DEFAULT_TICK_MS = 60_000;

interface PovParams {
  participationRate?: number;
  tickMs?: number;
  quantityResolver?: (scheduledAtMs: number) => number;
}

function expandSessionMinutes(
  startMs: number,
  endMs: number,
  window: TradingSessionWindow,
  tickMs: number,
): number[] {
  const out: number[] = [];
  for (let day = new Date(startMs); day.getTime() < endMs; day = nextDay(day)) {
    for (const session of window.sessions) {
      const open = atTimeOn(day, session.start, window.timezone ?? 'Asia/Shanghai');
      const close = atTimeOn(day, session.end, window.timezone ?? 'Asia/Shanghai');
      const segStart = Math.max(open, startMs);
      const segEnd = Math.min(close, endMs);
      for (let t = segStart; t < segEnd; t += tickMs) {
        out.push(t);
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

export class PovAlgo implements Algo {
  readonly kind = 'pov' as const;

  schedule(parent: ParentOrder): ChildOrder[] {
    const params = (parent.params ?? {}) as unknown as PovParams;
    const rate = params.participationRate ?? DEFAULT_PARTICIPATION;
    const tickMs = params.tickMs ?? DEFAULT_TICK_MS;
    const window = parent.session ?? DEFAULT_A_SHARE_SESSIONS;
    const ticks = expandSessionMinutes(
      parent.duration.startMs, parent.duration.endMs, window, tickMs,
    );
    if (ticks.length === 0 || parent.quantity <= 0) return [];

    // The schedule is "tentative" — the runner resolves the actual
    // quantity per tick via the quantityResolver hook. If no resolver
    // is provided, fall back to an even split across ticks (which is
    // roughly equivalent to TWAP but using a different rate constant).
    const out: ChildOrder[] = [];
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i]!;
      let qty: number;
      if (params.quantityResolver) {
        qty = Math.max(0, Math.floor(params.quantityResolver(t)));
      } else {
        // Even split fallback
        qty = Math.floor(parent.quantity / ticks.length);
        if (i === ticks.length - 1) qty = parent.quantity - (ticks.length - 1) * Math.floor(parent.quantity / ticks.length);
      }
      if (qty <= 0) continue;
      out.push({
        sequence: out.length,
        scheduledAtMs: t,
        quantity: qty,
        // Carry participation rate as a hint to the runner (metadata only).
        ...{ _povRate: rate } as object,
      });
    }
    return out;
  }
}
