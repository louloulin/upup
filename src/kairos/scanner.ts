/**
 * KAIROS Event Scanner
 *
 * Pre-market / intraday / post-market scans that detect significant
 * market events — price gaps, volume spikes, breaking news, large
 * orders — and emit structured events on the bus.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      (Requirement: Event Scanner)
 */

import type { EventBus } from "../core/event-bus.js";
import type { OpportunityKind } from "./types.js";

export type ScannerSession = "pre-market" | "intraday" | "post-market";

export interface ScanSymbol {
  symbol: string;
  last: number;
  prevClose: number;
  volume: number;
  avgVolume20d: number;
  /** Optional overnight gap reference for pre-market sessions. */
  preMarketLast?: number;
  /** Optional recent order flow: positive = buy, negative = sell, in CNY. */
  recentOrderFlowCny?: number;
  /** Optional news headline for the symbol. */
  newsHeadline?: string;
}

export interface ScanEvent {
  symbol: string;
  kind: ScannerEventKind;
  session: ScannerSession;
  confidence: number;
  headline: string;
  data: Record<string, unknown>;
  detectedAt: number;
}

export type ScannerEventKind =
  | "price-anomaly"
  | "volume-spike"
  | "breaking-news"
  | "large-order"
  | "overnight-gap";

export interface ScannerConfig {
  /** Topic prefix. Default 'kairos.scanner'. */
  topicPrefix?: string;
  /** Gap threshold (fraction). Default 0.03 (3%). */
  gapThreshold?: number;
  /** Volume multiple threshold. Default 2.5. */
  volumeSpikeMult?: number;
  /** Large order CNY threshold. Default 50,000,000. */
  largeOrderThreshold?: number;
  /** Keywords that mark a headline as breaking news. */
  breakingNewsKeywords?: string[];
  /** Clock for tests. */
  now?: () => number;
}

export interface EventScannerDeps {
  bus: EventBus;
  /** Returns the symbols to scan in a given session. */
  fetchSymbols: (session: ScannerSession) => Promise<ScanSymbol[]> | ScanSymbol[];
  config?: ScannerConfig;
}

const DEFAULT_KEYWORDS = [
  "突发",
  "重大",
  "停牌",
  "退市",
  "重组",
  "业绩",
  "公告",
  "美联储",
  "降息",
  "加息",
  "war",
  "merger",
  "guidance",
  "halt",
  "delisting",
];

const DEFAULTS = {
  topicPrefix: "kairos.scanner",
  gapThreshold: 0.03,
  volumeSpikeMult: 2.5,
  largeOrderThreshold: 50_000_000,
  breakingNewsKeywords: DEFAULT_KEYWORDS,
};

export interface ScanReport {
  session: ScannerSession;
  scanned: number;
  emitted: number;
  events: ScanEvent[];
}

export interface EventScanner {
  runPreMarket: () => Promise<ScanReport>;
  runIntraday: () => Promise<ScanReport>;
  runPostMarket: () => Promise<ScanReport>;
  /** Run a specific session explicitly. */
  runSession: (session: ScannerSession) => Promise<ScanReport>;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 0.99) return 0.99;
  return x;
}

function detectOvernightGap(
  sym: ScanSymbol,
  session: ScannerSession,
  threshold: number,
  ts: number,
): ScanEvent | null {
  if (session !== "pre-market") return null;
  const ref = sym.preMarketLast ?? sym.last;
  if (sym.prevClose <= 0) return null;
  const gap = (ref - sym.prevClose) / sym.prevClose;
  if (Math.abs(gap) < threshold) return null;
  const confidence = clamp01(0.5 + Math.abs(gap) * 5);
  return {
    symbol: sym.symbol,
    kind: "overnight-gap",
    session,
    confidence,
    headline: `${sym.symbol} 跳空 ${gap > 0 ? "+" : ""}${(gap * 100).toFixed(2)}% (prevClose ${sym.prevClose} → ${ref})`,
    data: { prevClose: sym.prevClose, last: ref, gapPct: gap },
    detectedAt: ts,
  };
}

function detectPriceAnomaly(
  sym: ScanSymbol,
  session: ScannerSession,
  threshold: number,
  ts: number,
): ScanEvent | null {
  if (session === "post-market") return null; // post-market price moves are noisy
  if (sym.prevClose <= 0) return null;
  const change = (sym.last - sym.prevClose) / sym.prevClose;
  if (Math.abs(change) < threshold) return null;
  const confidence = clamp01(0.5 + Math.abs(change) * 5);
  return {
    symbol: sym.symbol,
    kind: "price-anomaly",
    session,
    confidence,
    headline: `${sym.symbol} ${change > 0 ? "+" : ""}${(change * 100).toFixed(2)}% intraday move`,
    data: { last: sym.last, prevClose: sym.prevClose, changePct: change },
    detectedAt: ts,
  };
}

function detectVolumeSpike(
  sym: ScanSymbol,
  session: ScannerSession,
  multThreshold: number,
  ts: number,
): ScanEvent | null {
  if (sym.avgVolume20d <= 0) return null;
  const mult = sym.volume / sym.avgVolume20d;
  if (mult < multThreshold) return null;
  const confidence = clamp01(0.5 + (mult - multThreshold) * 0.05);
  return {
    symbol: sym.symbol,
    kind: "volume-spike",
    session,
    confidence,
    headline: `${sym.symbol} volume ${mult.toFixed(1)}x 20d avg (${sym.volume.toLocaleString()} shares)`,
    data: { volume: sym.volume, avgVolume20d: sym.avgVolume20d, mult },
    detectedAt: ts,
  };
}

function detectLargeOrder(
  sym: ScanSymbol,
  session: ScannerSession,
  threshold: number,
  ts: number,
): ScanEvent | null {
  if (sym.recentOrderFlowCny === undefined) return null;
  if (Math.abs(sym.recentOrderFlowCny) < threshold) return null;
  const direction = sym.recentOrderFlowCny > 0 ? "buy" : "sell";
  const confidence = clamp01(
    0.5 + Math.min(0.5, Math.abs(sym.recentOrderFlowCny) / (threshold * 10)),
  );
  return {
    symbol: sym.symbol,
    kind: "large-order",
    session,
    confidence,
    headline: `${sym.symbol} 大单 ${direction} ${(sym.recentOrderFlowCny / 1e8).toFixed(2)}亿`,
    data: { orderFlowCny: sym.recentOrderFlowCny, direction },
    detectedAt: ts,
  };
}

function detectBreakingNews(
  sym: ScanSymbol,
  keywords: string[],
  ts: number,
): ScanEvent | null {
  const headline = sym.newsHeadline;
  if (!headline) return null;
  const lower = headline.toLowerCase();
  const matched = keywords.find((k) => lower.includes(k.toLowerCase()));
  if (!matched) return null;
  return {
    symbol: sym.symbol,
    kind: "breaking-news",
    session: "intraday", // breaking news is generally surfaced during the day
    confidence: 0.85,
    headline: `${sym.symbol} 突发: ${headline}`,
    data: { rawHeadline: headline, matchedKeyword: matched },
    detectedAt: ts,
  };
}

export function createEventScanner(deps: EventScannerDeps): EventScanner {
  const cfg = { ...DEFAULTS, ...deps.config };
  const now = cfg.now ?? (() => Date.now());

  async function runSession(session: ScannerSession): Promise<ScanReport> {
    const symbols = await deps.fetchSymbols(session);
    const ts = now();
    const events: ScanEvent[] = [];

    for (const sym of symbols) {
      // Pre-market: focus on overnight gap; intraday: price+volume+orders+news;
      // post-market: volume recap (no live price action).
      const candidates: Array<ScanEvent | null> = [
        detectOvernightGap(sym, session, cfg.gapThreshold, ts),
        detectPriceAnomaly(sym, session, cfg.gapThreshold, ts),
        detectVolumeSpike(sym, session, cfg.volumeSpikeMult, ts),
        detectLargeOrder(sym, session, cfg.largeOrderThreshold, ts),
        // news detector session is overridden to 'intraday' internally
        session === "pre-market" || session === "post-market"
          ? null
          : detectBreakingNews(sym, cfg.breakingNewsKeywords, ts),
      ];
      for (const ev of candidates) {
        if (ev) events.push(ev);
      }
    }

    // Stable order: highest confidence first, then symbol.
    events.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.symbol.localeCompare(b.symbol);
    });

    for (const ev of events) {
      deps.bus.emit<ScanEvent>(`${cfg.topicPrefix}.${ev.kind}`, ev);
    }

    return { session, scanned: symbols.length, emitted: events.length, events };
  }

  return {
    runPreMarket: () => runSession("pre-market"),
    runIntraday: () => runSession("intraday"),
    runPostMarket: () => runSession("post-market"),
    runSession,
  };
}

export const _internal = {
  detectOvernightGap,
  detectPriceAnomaly,
  detectVolumeSpike,
  detectLargeOrder,
  detectBreakingNews,
  DEFAULTS,
};
