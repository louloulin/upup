/**
 * Trading Algos - Common Types
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *
 * Algos (TWAP / VWAP / POV / IS) all consume a ParentOrder and produce a
 * stream of ChildOrders scheduled over time. The runner submits each
 * child order to the configured BrokerAdapter (sandbox for paper, real
 * broker for live) and aggregates results into a final report.
 */

import type { Order, OrderSide, OrderType } from '../types.js';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type AlgoKind = 'twap' | 'vwap' | 'pov' | 'is';

export interface ParentOrder {
  /** Unique client-provided ID. */
  id?: string;
  symbol: string;
  side: OrderSide;
  /** Total shares to execute across all child orders. */
  quantity: number;
  /** Optional reference price (arrival price for IS, current for VWAP, etc.). */
  referencePrice?: number;
  /** Total duration over which to spread the parent order. */
  duration: {
    /** Start time as ms epoch. */
    startMs: number;
    /** End time as ms epoch. */
    endMs: number;
  };
  /**
   * Trading session window (inclusive). Orders scheduled outside this
   * window are deferred. Defaults to A-share morning + afternoon sessions.
   */
  session?: TradingSessionWindow;
  /** Optional cap on child order size (shares). */
  maxChildQuantity?: number;
  /** Optional floor on child order size (shares); child orders below this are merged. */
  minChildQuantity?: number;
  /** Order type for child orders. Default 'market'. */
  childOrderType?: OrderType;
  /** Limit price for child orders when childOrderType is 'limit' or 'stop_limit'. */
  childLimitPrice?: number;
  /** Algo-specific parameters. */
  params?: Record<string, unknown>;
}

export interface TradingSessionWindow {
  /** Asia/Shanghai by default. Time-of-day strings HH:MM (24h). */
  timezone?: string;
  sessions: Array<{ start: string; end: string }>;
}

/** A-share default sessions (Mon-Fri, no weekends). */
export const DEFAULT_A_SHARE_SESSIONS: TradingSessionWindow = {
  timezone: 'Asia/Shanghai',
  sessions: [
    { start: '09:30', end: '11:30' },
    { start: '13:00', end: '15:00' },
  ],
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface ChildOrder {
  /** Runner-assigned sequential ID within the parent. */
  sequence: number;
  /** ms epoch when this child should be submitted. */
  scheduledAtMs: number;
  quantity: number;
  /** Final order submitted to the broker; populated after submit. */
  order?: Order;
  /** When this child was filled (ms epoch). */
  filledAtMs?: number;
  /** Actual fill price (may differ from limit due to slippage). */
  fillPrice?: number;
}

export interface AlgoProgress {
  parentId: string;
  totalQuantity: number;
  filledQuantity: number;
  childCount: number;
  filledChildCount: number;
  averageFillPrice: number;
  /** Implementation shortfall in basis points vs referencePrice. */
  slippageBps: number;
  /** Aggregated commission paid. */
  totalCommission: number;
  /** ms epoch when the algo started. */
  startedAtMs: number;
  /** ms epoch of last update. */
  updatedAtMs: number;
  /** Final state. */
  state: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
}

export interface AlgoReport extends AlgoProgress {
  /** Per-child detail for audit / debugging. */
  children: ChildOrder[];
  /** Free-form notes (e.g. why an order was deferred). */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Algorithm Interface
// ---------------------------------------------------------------------------

/**
 * Algo - Pure schedule generator. An algo is responsible only for
 * deciding WHEN and HOW MUCH; the runner handles the actual broker
 * submission and state aggregation.
 */
export interface Algo {
  readonly kind: AlgoKind;
  /**
   * Build a schedule of child orders for the given parent. Returns the
   * full schedule up front (deterministic) so the runner can persist /
   * resume it.
   */
  schedule(parent: ParentOrder): ChildOrder[];
}
