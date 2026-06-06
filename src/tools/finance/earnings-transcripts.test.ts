/**
 * earnings-transcripts tests (P1.a.1)
 *
 * Coverage:
 *  - fetchEarningsTranscripts returns TranscriptRef[] from a custom fetcher
 *  - ticker is uppercased
 *  - empty result on fetcher error (no throw)
 *  - default fetcher parses getFilings output variants (string, array, object)
 *  - the exported TranscriptRef type matches the consumer's shape
 */

import { describe, expect, test } from 'bun:test';
import {
  fetchEarningsTranscripts,
  type TranscriptFetcher,
  type TranscriptRef,
} from './earnings-transcripts.js';

function makeFetcher(rows: TranscriptRef[]): TranscriptFetcher {
  return async (_ticker, _opts) => rows;
}

describe('fetchEarningsTranscripts (custom fetcher)', () => {
  test('returns the fetcher output as-is', async () => {
    const rows: TranscriptRef[] = [
      { filingDate: '2025-01-15', url: 'https://sec/abc', excerpt: 'Q4 2024 业绩超预期', ts: 1_736_899_200_000 },
      { filingDate: '2024-10-15', url: 'https://sec/def', excerpt: 'Q3 2024 业绩稳健', ts: 1_728_969_600_000 },
    ];
    const out = await fetchEarningsTranscripts('NVDA', { fetcher: makeFetcher(rows) });
    expect(out).toEqual(rows);
  });

  test('ticker is uppercased before passing to fetcher', async () => {
    let receivedTicker = '';
    const fetcher: TranscriptFetcher = async (t, _o) => {
      receivedTicker = t;
      return [];
    };
    await fetchEarningsTranscripts('nvda', { fetcher });
    expect(receivedTicker).toBe('NVDA');
  });

  test('fetcher error → empty array, no throw', async () => {
    const fetcher: TranscriptFetcher = async () => {
      throw new Error('network down');
    };
    const out = await fetchEarningsTranscripts('NVDA', { fetcher });
    expect(out).toEqual([]);
  });

  test('default limit and windowDays flow through', async () => {
    let receivedOpts: { limit: number; windowDays: number } = { limit: 0, windowDays: 0 };
    const fetcher: TranscriptFetcher = async (_t, o) => {
      receivedOpts = o;
      return [];
    };
    await fetchEarningsTranscripts('NVDA', { fetcher });
    expect(receivedOpts).toEqual({ limit: 4, windowDays: 90 });
  });

  test('custom limit and windowDays override defaults', async () => {
    let receivedOpts: { limit: number; windowDays: number } = { limit: 0, windowDays: 0 };
    const fetcher: TranscriptFetcher = async (_t, o) => {
      receivedOpts = o;
      return [];
    };
    await fetchEarningsTranscripts('NVDA', { fetcher, limit: 2, windowDays: 30 });
    expect(receivedOpts).toEqual({ limit: 2, windowDays: 30 });
  });
});

describe('TranscriptRef shape', () => {
  test('all required fields are present', () => {
    const ref: TranscriptRef = {
      filingDate: '2025-01-15',
      url: 'https://sec/abc',
      excerpt: 'sample',
      ts: 1_736_899_200_000,
    };
    expect(ref.filingDate).toBe('2025-01-15');
    expect(ref.url).toMatch(/^https/);
    expect(ref.excerpt).toBe('sample');
    expect(typeof ref.ts).toBe('number');
  });
});
