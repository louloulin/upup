/**
 * DragonTigerAdapter — 龙虎榜 + 大宗交易
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/alt-data
 *      → Requirement: News Adapter (extended to dragon-tiger)
 * Design: D18 — 2 priority adapters
 *
 * Fetches from 东方财富 datacenter (LHB) and 沪深交易所 (大宗交易).
 * Lazy credential loading: no API key required at construction.
 */

import type { AltDataAdapter, FetchInput, NormalizedEvent, RawEvent } from './types.js';
import { AltDataError, normalizeEvent } from './types.js';

export interface DragonTigerConfig {
  fetcher?: (url: string) => Promise<unknown>;
  apiKey?: string;
}

interface DragonTigerItem {
  symbol: string;
  branch: string;
  action: 'buy' | 'sell';
  amount: number;
  url: string;
  publishedAt: number;
}

interface DragonTigerResponse {
  items: DragonTigerItem[];
}

const DEFAULT_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MARGIN_STOCK';

export class DragonTigerAdapter implements AltDataAdapter {
  readonly source = 'dragon-tiger' as const;

  constructor(private readonly config: DragonTigerConfig = {}) {}

  async fetch(input: FetchInput): Promise<NormalizedEvent[]> {
    if (!this.config.fetcher && !this.config.apiKey) {
      throw new AltDataError('NO_CREDENTIALS', 'EAST_MONEY_LHB_KEY not set. Provide via env or interactive setup.');
    }
    const fetcher = this.config.fetcher ?? this.defaultFetcher;
    const raw = await fetcher(DEFAULT_URL) as DragonTigerResponse;
    if (!raw?.items) {
      throw new AltDataError('INVALID_RESPONSE', 'Empty items array from dragon-tiger source');
    }
    const events = raw.items
      .filter(item => !input.symbols || input.symbols.includes(item.symbol))
      .filter(item => !input.dateRange
        || (item.publishedAt >= input.dateRange[0] && item.publishedAt <= input.dateRange[1]))
      .map(item => this.toRawEvent(item))
      .map(normalizeEvent);

    const seen = new Set<string>();
    return events.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  normalize(raw: RawEvent): NormalizedEvent { return normalizeEvent(raw); }

  private toRawEvent(item: DragonTigerItem): RawEvent {
    return {
      source: 'dragon-tiger',
      title: `${item.branch} ${item.action === 'buy' ? '买入' : '卖出'} ${item.symbol} ${(item.amount / 1e8).toFixed(2)}亿`,
      url: item.url,
      publishedAt: item.publishedAt,
      symbols: [item.symbol],
      sentiment: item.action === 'buy' ? 'positive' : 'negative',
      raw: { branch: item.branch, action: item.action, amount: item.amount },
    };
  }

  private async defaultFetcher(url: string): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new AltDataError('FETCH_FAILED', `HTTP ${res.status}`);
    return res.json();
  }
}
