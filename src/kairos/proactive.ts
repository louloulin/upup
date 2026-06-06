/**
 * Proactive Opportunity Discovery
 *
 * When the user is idle, scan the watchlist and broader market for
 * opportunities: technical breakouts, valuation re-rating, sentiment
 * shifts, capital flow anomalies. Emits ranked opportunity events to
 * the event bus.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      (Requirement: Proactive Opportunity Discovery)
 */

import type { EventBus } from '../core/event-bus.js';
import {
  DEFAULT_PROACTIVE_CONFIG,
  type Opportunity,
  type OpportunityKind,
  type ProactiveConfig,
} from './types.js';
import { ProactiveState } from './proactiveState.js';

/**
 * A watchlist dossier that has not been refreshed for more than the staleness
 * threshold. Injected into the proactive scanner so the detector does not
 * depend on `src/memory/dossier.ts` directly (avoids Layer 3 → Layer 3
 * coupling). The CLI / TUI integration is responsible for reading the
 * dossier store and translating it into this shape.
 */
export interface StaleDossierEntry {
  ticker: string;
  /** Whole days since the dossier was last refreshed. */
  freshnessDays: number;
  /** Optional source label (e.g. 'dossier-store', 'mock'). */
  source?: string;
}

export interface MarketSnapshot {
  symbol: string;
  last: number;
  prevClose: number;
  volume: number;
  avgVolume20d: number;
  /** Latest news sentiment in [-1, 1]. 0 means neutral / unknown. */
  sentiment?: number;
  /** Trailing PE. Lower = cheaper; undefined means unknown. */
  pe?: number;
  /** Sector PE for valuation re-rating comparison. */
  sectorPe?: number;
  /** Net main-board inflow (CNY) over the last bar. Positive = inflow. */
  netInflow?: number;
}

export type IdleTracker = () => number;

export interface ProactiveDeps {
  bus: EventBus;
  /** Returns the watchlist + market snapshot to scan. */
  fetchSnapshots: () => Promise<MarketSnapshot[]>;
  /** Returns ms since the last user interaction. */
  getIdleMs?: IdleTracker;
  /** Override default config. */
  config?: ProactiveConfig;
  /** Optional clock for tests. */
  now?: () => number;
  /**
   * Optional 6-property state machine. When provided, the scanner
   * consults shouldRun() before each scan (active && !paused &&
   * !contextBlocked). When absent, the scanner falls back to the
   * idle-threshold check only.
   */
  state?: ProactiveState;
  /**
   * Optional fetcher for watchlist dossiers that have gone stale
   * (freshness > staleAfterDays, default 30). When provided the
   * detector emits a `stale-dossier` opportunity for each entry. The
   * dependency is injected to avoid a direct edge from
   * `src/kairos/proactive.ts` (Layer 3) into
   * `src/memory/dossier.ts` (also Layer 3).
   */
  fetchStaleDossiers?: () => Promise<StaleDossierEntry[]>;
}

const HIGH_VOLUME_MULT = 2.0;
const GAP_PCT = 0.02;
const VALUATION_DIVERGENCE_PCT = 0.3;
const SENTIMENT_SHIFT = 0.5;
const FLOW_ANOMALY = 100_000_000; // 1 亿 CNY

function defaultIdle(): number {
  // Conservative default: never idle by default. Real CLI wires the
  // last-input timestamp from the prompt store.
  return 0;
}

function detectBreakout(snap: MarketSnapshot, now: number): Opportunity | null {
  if (snap.prevClose <= 0) return null;
  const gapPct = (snap.last - snap.prevClose) / snap.prevClose;
  const volMult = snap.avgVolume20d > 0 ? snap.volume / snap.avgVolume20d : 0;
  if (gapPct < GAP_PCT || volMult < HIGH_VOLUME_MULT) return null;

  // Confidence scales with how much the gap exceeds the threshold and
  // how dramatic the volume is. Capped at 0.99.
  const confidence = Math.min(0.99, 0.5 + gapPct * 5 + (volMult - HIGH_VOLUME_MULT) * 0.05);
  return {
    symbol: snap.symbol,
    kind: 'technical-breakout',
    confidence,
    headline: `${snap.symbol} breakout: +${(gapPct * 100).toFixed(2)}% on ${volMult.toFixed(1)}x volume`,
    data: { last: snap.last, prevClose: snap.prevClose, volume: snap.volume, avgVolume20d: snap.avgVolume20d },
    source: 'breakout-detector',
    detectedAt: now,
  };
}

function detectValuationRerating(snap: MarketSnapshot, now: number): Opportunity | null {
  if (snap.pe === undefined || snap.sectorPe === undefined || snap.sectorPe <= 0) return null;
  const divergence = (snap.sectorPe - snap.pe) / snap.sectorPe;
  if (divergence < VALUATION_DIVERGENCE_PCT) return null;
  const confidence = Math.min(0.99, 0.5 + divergence);
  return {
    symbol: snap.symbol,
    kind: 'valuation-rerating',
    confidence,
    headline: `${snap.symbol} trades at PE ${snap.pe.toFixed(1)} vs sector ${snap.sectorPe.toFixed(1)} (${(divergence * 100).toFixed(0)}% discount)`,
    data: { pe: snap.pe, sectorPe: snap.sectorPe, divergence },
    source: 'valuation-detector',
    detectedAt: now,
  };
}

function detectSentimentShift(snap: MarketSnapshot, now: number): Opportunity | null {
  if (snap.sentiment === undefined) return null;
  if (Math.abs(snap.sentiment) < SENTIMENT_SHIFT) return null;
  const direction = snap.sentiment > 0 ? 'positive' : 'negative';
  const confidence = Math.min(0.99, 0.5 + Math.abs(snap.sentiment) * 0.4);
  return {
    symbol: snap.symbol,
    kind: 'sentiment-shift',
    confidence,
    headline: `${snap.symbol} sentiment shifted ${direction} (${snap.sentiment.toFixed(2)})`,
    data: { sentiment: snap.sentiment },
    source: 'sentiment-detector',
    detectedAt: now,
  };
}

function detectFlowAnomaly(snap: MarketSnapshot, now: number): Opportunity | null {
  if (snap.netInflow === undefined) return null;
  if (Math.abs(snap.netInflow) < FLOW_ANOMALY) return null;
  const direction = snap.netInflow > 0 ? 'inflow' : 'outflow';
  const confidence = Math.min(0.99, 0.5 + Math.min(0.5, Math.abs(snap.netInflow) / (FLOW_ANOMALY * 10)));
  return {
    symbol: snap.symbol,
    kind: 'capital-flow-anomaly',
    confidence,
    headline: `${snap.symbol} ${direction} ${(snap.netInflow / 1e8).toFixed(2)}亿 (anomaly threshold)`,
    data: { netInflow: snap.netInflow },
    source: 'flow-detector',
    detectedAt: now,
  };
}

function detectStaleDossier(
  entry: StaleDossierEntry,
  now: number,
): Opportunity | null {
  if (!Number.isFinite(entry.freshnessDays) || entry.freshnessDays <= 0) {
    return null;
  }
  // Confidence scales with how far past the threshold we are. Capped at
  // 0.99 so we never appear as a 'certain' signal.
  const confidence = Math.min(0.99, 0.5 + Math.min(0.5, entry.freshnessDays / 365));
  return {
    symbol: entry.ticker,
    kind: 'stale-dossier',
    confidence,
    headline:
      `${entry.ticker} dossier 未刷新 ${entry.freshnessDays} 天` +
      `(建议重读 8-K / 业绩预告 / 同业更新)`,
    data: { freshnessDays: entry.freshnessDays, source: entry.source ?? 'dossier-store' },
    source: 'stale-dossier-detector',
    detectedAt: now,
  };
}

const DETECTORS: Array<(s: MarketSnapshot, now: number) => Opportunity | null> = [
  detectBreakout,
  detectValuationRerating,
  detectSentimentShift,
  detectFlowAnomaly,
];

export interface ScanResult {
  scanned: number;
  emitted: number;
  opportunities: Opportunity[];
  skipped: boolean;
  skipReason?: string;
}

export interface ProactiveScanner {
  /** Run one scan, emit matching opportunities, return the structured result. */
  scan: () => Promise<ScanResult>;
}

export function createProactiveScanner(deps: ProactiveDeps): ProactiveScanner {
  const cfg = { ...DEFAULT_PROACTIVE_CONFIG, ...deps.config };
  const getIdleMs = deps.getIdleMs ?? defaultIdle;
  const now = deps.now ?? (() => Date.now());

  return {
    async scan(): Promise<ScanResult> {
      // State-machine gate (if wired). When the proactive is inactive,
      // paused, or context-blocked, skip without touching fetchSnapshots.
      if (deps.state && !deps.state.shouldRun()) {
        return {
          scanned: 0,
          emitted: 0,
          opportunities: [],
          skipped: true,
          skipReason: deps.state.isActive()
            ? deps.state.isPaused()
              ? 'proactive paused'
              : 'context-blocked'
            : 'proactive inactive',
        };
      }
      const idleMs = getIdleMs();
      if (idleMs < cfg.idleThresholdMs) {
        return {
          scanned: 0,
          emitted: 0,
          opportunities: [],
          skipped: true,
          skipReason: `user idle for ${idleMs}ms, below threshold ${cfg.idleThresholdMs}ms`,
        };
      }

      const snapshots = await deps.fetchSnapshots();
      const ts = now();
      const found: Opportunity[] = [];
      for (const snap of snapshots) {
        for (const detect of DETECTORS) {
          const opp = detect(snap, ts);
          if (opp && opp.confidence >= cfg.minConfidence) {
            found.push(opp);
          }
        }
      }

      // Stale-dossier detector has its own data source (dossier store,
      // not market snapshot). Fail soft if the fetcher is missing or
      // throws — opportunity detection must not break the rest of the
      // scan.
      if (deps.fetchStaleDossiers) {
        let stale: StaleDossierEntry[] = [];
        try {
          stale = await deps.fetchStaleDossiers();
        } catch {
          stale = [];
        }
        for (const entry of stale) {
          const opp = detectStaleDossier(entry, ts);
          if (opp && opp.confidence >= cfg.minConfidence) {
            found.push(opp);
          }
        }
      }

      // Rank by confidence desc, then by symbol for stable ordering.
      found.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return a.symbol.localeCompare(b.symbol);
      });

      const top = found.slice(0, cfg.maxPerScan);
      for (const opp of top) {
        const topic = `${cfg.topicPrefix}.${opp.kind}`;
        deps.bus.emit<Opportunity>(topic, opp);
      }

      return {
        scanned: snapshots.length,
        emitted: top.length,
        opportunities: top,
        skipped: false,
      };
    },
  };
}

export const _internal = {
  DETECTORS,
  detectBreakout,
  detectValuationRerating,
  detectSentimentShift,
  detectFlowAnomaly,
  detectStaleDossier,
};
