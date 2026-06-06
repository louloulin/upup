/**
 * NorthBoundAdapter — 北向资金 + 融资融券
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/alt-data
 *      → Requirement: News Adapter (extended to north-bound)
 * Design: D18
 *
 * Fetches 沪深港通 (north-bound) and 融资融券 (margin) data from 东方财富.
 * Emits 3 sub-events per fetch: sh-connect, sz-connect, margin.
 */

import type { AltDataAdapter, FetchInput, NormalizedEvent, RawEvent } from './types.js';
import { AltDataError, normalizeEvent } from './types.js';

export interface NorthBoundConfig {
  fetcher?: (url: string) => Promise<unknown>;
  apiKey?: string;
}

interface NorthBoundResponse {
  date: number;
  shConnect: { netInflow: number; topBuys: string[] };
  szConnect: { netInflow: number; topBuys: string[] };
  marginBalance: { total: number; change: number };
}

const DEFAULT_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_STOCK_HOLDRANKS';

export class NorthBoundAdapter implements AltDataAdapter {
  readonly source = 'north-bound' as const;

  constructor(private readonly config: NorthBoundConfig = {}) {}

  async fetch(input: FetchInput): Promise<NormalizedEvent[]> {
    if (!this.config.fetcher && !this.config.apiKey) {
      throw new AltDataError('NO_CREDENTIALS', 'HKEX_CONNECT_KEY not set. Provide via env or interactive setup.');
    }
    const fetcher = this.config.fetcher ?? this.defaultFetcher;
    const data = await fetcher(DEFAULT_URL) as NorthBoundResponse;
    const raws: RawEvent[] = [
      this.shConnectToRaw(data),
      this.szConnectToRaw(data),
      this.marginToRaw(data),
    ];
    const events = raws.map(normalizeEvent);
    return events.filter(e =>
      !input.symbols || e.symbols.some(s => input.symbols!.includes(s)));
  }

  normalize(raw: RawEvent): NormalizedEvent { return normalizeEvent(raw); }

  private shConnectToRaw(d: NorthBoundResponse): RawEvent {
    return {
      source: 'north-bound',
      title: `沪股通净流入 ${(d.shConnect.netInflow / 1e8).toFixed(2)}亿`,
      url: `${DEFAULT_URL}#sh-connect`,
      publishedAt: d.date,
      symbols: d.shConnect.topBuys,
      sentiment: d.shConnect.netInflow > 0 ? 'positive' : d.shConnect.netInflow < 0 ? 'negative' : 'neutral',
      raw: { subType: 'sh-connect', netInflow: d.shConnect.netInflow, topBuys: d.shConnect.topBuys },
    };
  }

  private szConnectToRaw(d: NorthBoundResponse): RawEvent {
    return {
      source: 'north-bound',
      title: `深股通净流入 ${(d.szConnect.netInflow / 1e8).toFixed(2)}亿`,
      url: `${DEFAULT_URL}#sz-connect`,
      publishedAt: d.date,
      symbols: d.szConnect.topBuys,
      sentiment: d.szConnect.netInflow > 0 ? 'positive' : d.szConnect.netInflow < 0 ? 'negative' : 'neutral',
      raw: { subType: 'sz-connect', netInflow: d.szConnect.netInflow, topBuys: d.szConnect.topBuys },
    };
  }

  private marginToRaw(d: NorthBoundResponse): RawEvent {
    return {
      source: 'north-bound',
      title: `融资融券余额变化 ${(d.marginBalance.change / 1e8).toFixed(2)}亿`,
      url: `${DEFAULT_URL}#margin`,
      publishedAt: d.date,
      symbols: [],
      sentiment: d.marginBalance.change > 0 ? 'positive' : d.marginBalance.change < 0 ? 'negative' : 'neutral',
      raw: { subType: 'margin', total: d.marginBalance.total, change: d.marginBalance.change },
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
