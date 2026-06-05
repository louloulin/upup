/**
 * Earnings-Date Trigger (P1.a.3)
 *
 * T-7d earnings preview trigger for the KAIROS scanner. Consumes an
 * injected earnings calendar (real impl will hit `src/realtime/`,
 * tests inject canned data) and emits a typed event on the bus whenever
 * a ticker has an earnings date within the configured window.
 *
 * Module boundary:
 *   earnings-trigger.ts (Layer 3) → core/event-bus (Layer 1) + kairos/types
 *   Zero dependency on scanner.ts — independent detector that shares
 *   the bus.
 */

import type { EventBus } from '../core/event-bus.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single earnings date entry from the calendar. */
export interface EarningsCalendarEntry {
  /** Ticker symbol (uppercased by the trigger). */
  ticker: string;
  /** Earnings call / release time (epoch ms). */
  earningsDate: number;
  /** Session of the call. */
  session: 'pre-market' | 'post-market' | 'after-hours';
  /** Optional analyst consensus revenue. */
  estimatedRevenue?: number;
  /** Optional analyst consensus EPS. */
  estimatedEps?: number;
  /** Free-form notes ("preliminary", "Q4 2024 actuals", etc.). */
  notes?: string;
}

/** Async calendar fetcher. Real impl hits a provider; tests inject canned data. */
export type EarningsCalendarFetcher = () => Promise<EarningsCalendarEntry[]>;

export interface EarningsTriggerConfig {
  /** Days before earnings to fire. Default 7 (per design P1.a.3). */
  triggerWindowDays?: number;
  /** Optional: only fire when dossier freshness > N days. Default 7. */
  dossierStaleDays?: number;
  /** Inject clock for tests. */
  now?: () => number;
  /**
   * Inject dossier freshness check. When provided AND the dossier is
   * fresh, the trigger skips that ticker. When undefined, the trigger
   * fires for every ticker in the window regardless of dossier state.
   */
  isDossierStale?: (ticker: string) => boolean;
  /** Topic prefix. Default 'kairos.scanner'. */
  topicPrefix?: string;
}

export interface EarningsTriggerDeps {
  bus: EventBus;
  fetchCalendar: EarningsCalendarFetcher;
  config?: EarningsTriggerConfig;
}

/** Event payload — emitted under `${prefix}.earnings-upcoming`. */
export interface EarningsUpcomingEvent {
  ticker: string;
  earningsDate: number;
  /** Whole days until earnings (0 = today, 7 = one week away). */
  daysUntil: number;
  session: EarningsCalendarEntry['session'];
  estimatedRevenue?: number;
  estimatedEps?: number;
  /** True when no dossier exists or dossier.freshnessTs > dossierStaleDays. */
  dossierStale: boolean;
  /** True if the earnings date is in the past (vs. upcoming). */
  inPast: boolean;
  detectedAt: number;
}

export interface EarningsTriggerResult {
  scanned: number;
  /** Events that were actually emitted on the bus. */
  fired: EarningsUpcomingEvent[];
  /** Tickers skipped because the dossier is fresh (dossierStaleDays gating). */
  skippedFresh: string[];
}

export interface EarningsTrigger {
  /** Run one trigger cycle. Returns a summary + emits events on the bus. */
  run: () => Promise<EarningsTriggerResult>;
}

const DEFAULTS = {
  triggerWindowDays: 7,
  dossierStaleDays: 7,
  topicPrefix: 'kairos.scanner',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between `earningsDate` and `now`. Positive = future,
 * negative = past. Always rounded toward zero (so 23h = 0, 25h = 1).
 */
export function daysUntil(earningsDate: number, now: number): number {
  const deltaMs = earningsDate - now;
  return Math.trunc(deltaMs / DAY_MS);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createEarningsTrigger(deps: EarningsTriggerDeps): EarningsTrigger {
  const cfg = { ...DEFAULTS, ...deps.config };
  const now = cfg.now ?? ((): number => Date.now());

  async function run(): Promise<EarningsTriggerResult> {
    const calendar = await deps.fetchCalendar();
    const ts = now();
    const fired: EarningsUpcomingEvent[] = [];
    const skippedFresh: string[] = [];

    for (const entry of calendar) {
      const ticker = entry.ticker.toUpperCase();
      const days = daysUntil(entry.earningsDate, ts);

      // Only consider dates within ±triggerWindowDays.
      if (Math.abs(days) > cfg.triggerWindowDays) continue;

      // Dossier freshness gating (optional).
      let dossierStale = true;
      if (cfg.isDossierStale) {
        dossierStale = cfg.isDossierStale(ticker);
        if (!dossierStale) {
          skippedFresh.push(ticker);
          continue;
        }
      }

      const ev: EarningsUpcomingEvent = {
        ticker,
        earningsDate: entry.earningsDate,
        daysUntil: days,
        session: entry.session,
        estimatedRevenue: entry.estimatedRevenue,
        estimatedEps: entry.estimatedEps,
        dossierStale,
        inPast: days < 0,
        detectedAt: ts,
      };
      deps.bus.emit<EarningsUpcomingEvent>(
        `${cfg.topicPrefix}.earnings-upcoming`,
        ev,
      );
      fired.push(ev);
    }

    // Stable order: nearest earnings first, then ticker.
    fired.sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      return a.ticker.localeCompare(b.ticker);
    });

    return { scanned: calendar.length, fired, skippedFresh };
  }

  return { run };
}
