/**
 * Alt-Data Adapter Types
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/alt-data
 *      → Requirement: AltDataAdapter Interface
 * Design: docs/superpowers/specs/2026-06-04-top-tier-investment-assistant-v2-design.md D18
 *
 * Unified interface for alternative data sources (龙虎榜 / 北向资金 / 融资融券 /
 * 财联社 / 研报 / 雪球 / X / Choice). Each adapter:
 *   - is registered lazily (no API key required at construction)
 *   - returns NormalizedEvent[] with a deterministic id for dedup
 *   - normalizes raw payloads to a uniform shape so downstream consumers
 *     (research/matrix/nl-screener) don't need source-specific handling.
 */

import { createHash } from 'node:crypto';

export type AltDataSource =
  | 'cls'
  | 'xinhua'
  | 'xueqiu'
  | 'x'
  | 'dragon-tiger'
  | 'north-bound'
  | 'reports'
  | 'choice';

export type AltDataSentiment = 'positive' | 'neutral' | 'negative' | null;

export interface NormalizedEvent {
  /** sha256(source + url + publishedAt), 64 hex chars, used for dedup */
  id: string;
  title: string;
  source: AltDataSource;
  url: string;
  /** ms epoch */
  publishedAt: number;
  /** related symbols, e.g. ['600519.SH', '000858.SZ'] */
  symbols: string[];
  sentiment: AltDataSentiment;
  raw: Record<string, unknown>;
}

export interface RawEvent {
  source: AltDataSource;
  title: string;
  url: string;
  publishedAt: number;
  symbols: string[];
  sentiment?: AltDataSentiment;
  raw: Record<string, unknown>;
}

export interface FetchInput {
  symbols?: string[];
  /** [startMs, endMs] */
  dateRange?: [number, number];
}

export interface AltDataAdapter {
  readonly source: AltDataSource;
  fetch(input: FetchInput): Promise<NormalizedEvent[]>;
  normalize(raw: RawEvent): NormalizedEvent;
}

export function normalizeEvent(raw: RawEvent): NormalizedEvent {
  const id = createHash('sha256')
    .update(`${raw.source}|${raw.url}|${raw.publishedAt}`)
    .digest('hex');
  return {
    id,
    title: raw.title,
    source: raw.source,
    url: raw.url,
    publishedAt: raw.publishedAt,
    symbols: raw.symbols,
    sentiment: raw.sentiment ?? null,
    raw: raw.raw,
  };
}

export type AltDataErrorCode = 'NO_CREDENTIALS' | 'FETCH_FAILED' | 'INVALID_RESPONSE';

export class AltDataError extends Error {
  constructor(public code: AltDataErrorCode, message: string) {
    super(message);
    this.name = 'AltDataError';
  }
}
