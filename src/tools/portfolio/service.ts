/**
 * Portfolio Service — business logic layer
 *
 * High-cohesion design: this module owns the *behavior* over positions
 * (CRUD, P&L calculation, sector summary, performance metrics). It is
 * unaware of LangChain, of the LLM, and of the tushare HTTP client.
 *
 * Dependencies (all injected):
 *   - PortfolioRepository — data access
 *   - PriceProvider       — current price + name lookup (defaults to tushare)
 *
 * v7-2 refactor: split from the old `tracker.ts` so business logic can be
 * unit-tested with a fake repository and a stub price provider.
 */

import { getTushareClient, getToday } from '../astock/tushare-client.js';
import type { Position, PortfolioRepository, InMemoryPortfolioRepository } from './store.js';
import { getDefaultPortfolioRepository } from './store.js';

// ---------------------------------------------------------------------------
// Price provider interface
// ---------------------------------------------------------------------------

export interface PriceQuote {
  price: number;
  name?: string;
  industry?: string;
}

export interface PriceProvider {
  /**
   * Get current price + metadata for a single ticker on the given date.
   * Implementations should never throw — return null on miss.
   */
  quote(code: string, date: string): Promise<PriceQuote | null>;
}

/**
 * Tushare-backed price provider. Production default.
 * Imports tushare-client lazily so tests can run without network keys.
 */
export class TusharePriceProvider implements PriceProvider {
  async quote(code: string, date: string): Promise<PriceQuote | null> {
    try {
      const client = getTushareClient();
      const data = await client.daily({ ts_code: code, trade_date: date });
      if (!Array.isArray(data) || data.length === 0) return null;
      const price = parseFloat(String(data[0].close || 0));
      const info = await client.stockBasic({ ts_code: code }).catch(() => []);
      const name = Array.isArray(info) && info.length > 0 ? (info[0] as { name?: string }).name : undefined;
      const industry = Array.isArray(info) && info.length > 0 ? (info[0] as { industry?: string }).industry : undefined;
      return { price, name, industry };
    } catch {
      return null;
    }
  }
}

/**
 * Null price provider used when the caller doesn't want live prices
 * (e.g. backfill, dry-run, tests). Always returns null.
 */
export class NullPriceProvider implements PriceProvider {
  async quote(_code: string, _date: string): Promise<PriceQuote | null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service result types
// ---------------------------------------------------------------------------

export interface AddPositionInput {
  code: string;
  quantity: number;
  entry_price: number;
  entry_date?: string;
}

export interface PortfolioMetrics {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_pct: number;
  day_change: number;
  day_change_pct: number;
}

export interface SectorSummary {
  sectors: Array<{
    sector: string;
    value: number;
    pnl: number;
    pnl_pct: number;
  }>;
  positions_count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PortfolioService {
  constructor(
    private readonly repo: PortfolioRepository,
    private readonly prices: PriceProvider,
  ) {}

  /**
   * Add a new position. Returns the stored Position (with generated id).
   */
  add(input: AddPositionInput): Position {
    if (!input.code || !input.quantity || !input.entry_price) {
      throw new Error('add requires code, quantity, entry_price');
    }
    const id = (this.repo as InMemoryPortfolioRepository).nextId
      ? (this.repo as InMemoryPortfolioRepository).nextId()
      : `POS${Date.now()}`;
    const position: Position = {
      id,
      code: input.code,
      quantity: input.quantity,
      entry_price: input.entry_price,
      entry_date: input.entry_date ?? getToday(),
    };
    this.repo.add(position);
    return position;
  }

  remove(positionId: string): boolean {
    return this.repo.remove(positionId);
  }

  /**
   * List all positions enriched with current price + P&L.
   * Positions that fail to get a live price are returned unchanged.
   */
  async listWithPnl(): Promise<Position[]> {
    const positions = this.repo.list();
    const today = getToday();
    const out: Position[] = [];
    for (const pos of positions) {
      const q = await this.prices.quote(pos.code, today);
      if (q) {
        out.push({
          ...pos,
          current_price: q.price,
          pnl: (q.price - pos.entry_price) * pos.quantity,
          pnl_pct: pos.entry_price > 0 ? ((q.price / pos.entry_price) - 1) * 100 : 0,
          ...(q.name ? { name: q.name } : {}),
        });
      } else {
        out.push({ ...pos });
      }
    }
    return out;
  }

  /**
   * Aggregate performance metrics across the whole portfolio.
   * Missing prices contribute 0 to current value (cost basis still counted).
   */
  async performance(): Promise<PortfolioMetrics> {
    const positions = this.repo.list();
    const today = getToday();
    let totalValue = 0;
    let totalCost = 0;
    for (const pos of positions) {
      totalCost += pos.entry_price * pos.quantity;
      const q = await this.prices.quote(pos.code, today);
      if (q) totalValue += q.price * pos.quantity;
    }
    return {
      total_value: totalValue,
      total_cost: totalCost,
      total_pnl: totalValue - totalCost,
      total_pnl_pct: totalCost > 0 ? ((totalValue / totalCost) - 1) * 100 : 0,
      day_change: 0,
      day_change_pct: 0,
    };
  }

  /**
   * Group positions by sector and compute per-sector P&L.
   * Sectors without industry metadata land in 'Unknown'.
   */
  async summaryBySector(): Promise<SectorSummary> {
    const positions = this.repo.list();
    const today = getToday();
    const sectorMap = new Map<string, { value: number; pnl: number }>();
    let pricedCount = 0;

    for (const pos of positions) {
      const q = await this.prices.quote(pos.code, today);
      const industry = q?.industry ?? 'Unknown';
      const currentPrice = q?.price ?? pos.entry_price;
      const value = currentPrice * pos.quantity;
      const cost = pos.entry_price * pos.quantity;
      const pnl = value - cost;
      if (q) pricedCount++;

      const existing = sectorMap.get(industry) ?? { value: 0, pnl: 0 };
      sectorMap.set(industry, {
        value: existing.value + value,
        pnl: existing.pnl + pnl,
      });
    }

    const sectors = Array.from(sectorMap.entries()).map(([name, data]) => ({
      sector: name,
      value: data.value,
      pnl: data.pnl,
      pnl_pct: data.value - data.pnl > 0 ? (data.pnl / (data.value - data.pnl)) * 100 : 0,
    }));

    return {
      positions_count: pricedCount,
      sectors,
    };
  }
}

// ---------------------------------------------------------------------------
// Default singleton accessor (preserves the original tracker.ts behavior)
// ---------------------------------------------------------------------------

let defaultService: PortfolioService | null = null;

export function getDefaultPortfolioService(): PortfolioService {
  if (!defaultService) {
    defaultService = new PortfolioService(
      getDefaultPortfolioRepository(),
      new TusharePriceProvider(),
    );
  }
  return defaultService;
}

export function __resetDefaultPortfolioService(): void {
  defaultService = null;
}
