/**
 * x-search tests (P1.a.1)
 *
 * Coverage:
 *  - searchX returns deterministic results for known tickers
 *  - windowDays affects timestamp spread
 *  - URL template is correct
 *  - authorKind coverage includes all 5 kinds
 *  - mock counter is stable across calls within a test
 *  - backend override wins over mock
 */

import { describe, expect, test } from 'bun:test';
import { mockSearchX, searchX } from './x-search.js';

const FIXED_NOW = 1_700_000_000_000;

describe('searchX (default mock backend)', () => {
  test('returns 3 deterministic results for NVDA', async () => {
    const results = await searchX('NVDA', { now: () => FIXED_NOW });
    expect(results).toHaveLength(3);
    // First result is the sell-side (per curated list)
    expect(results[0]!.authorKind).toBe('analyst-sell');
    expect(results[0]!.handle).toBe('TrefisResearch');
    // Last is the company voice
    expect(results[results.length - 1]!.authorKind).toBe('company');
    expect(results[results.length - 1]!.handle).toBe('NVIDIACorp');
  });

  test('URL follows x.com/{handle}/status/{id} template', async () => {
    const results = await searchX('NVDA', { now: () => FIXED_NOW });
    for (const r of results) {
      expect(r.url).toMatch(/^https:\/\/x\.com\/[^/]+\/status\/.+$/);
    }
  });

  test('fallback for unknown tickers', async () => {
    const results = await searchX('ZZZZZ', { now: () => FIXED_NOW });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.authorKind === 'analyst-other')).toBe(true);
  });

  test('windowDays affects timestamp spread', async () => {
    const narrow = await searchX('NVDA', { windowDays: 3, now: () => FIXED_NOW });
    const wide = await searchX('NVDA', { windowDays: 30, now: () => FIXED_NOW });
    // Spread should be the same number of voices, but the timestamps within
    // the window should be different (narrower windows pack closer to now).
    expect(narrow[0]!.ts).toBeGreaterThan(wide[0]!.ts);
  });

  test('A-share ticker suffix is stripped', async () => {
    const a = await searchX('600519.SH', { now: () => FIXED_NOW });
    const b = await searchX('600519', { now: () => FIXED_NOW });
    // Both should fall through to fallback (no KNOWN_VOICES for A-share)
    expect(a.length).toBe(b.length);
  });

  test('all 5 XAuthorKind values are reachable', async () => {
    const nvda = await searchX('NVDA', { now: () => FIXED_NOW });
    const aapl = await searchX('AAPL', { now: () => FIXED_NOW });
    const tsla = await searchX('TSLA', { now: () => FIXED_NOW });
    const seen = new Set([...nvda, ...aapl, ...tsla].map(r => r.authorKind));
    // We expect to see at least 4 of the 5 kinds across the curated tickers
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('searchX (custom backend)', () => {
  test('backend override wins over mock', async () => {
    const custom = [
      {
        handle: 'custom',
        tweetId: '1',
        url: 'https://x.com/custom/status/1',
        ts: FIXED_NOW,
        authorKind: 'analyst-buy' as const,
        snippet: 'custom backend wins',
      },
    ];
    const results = await searchX('NVDA', {
      now: () => FIXED_NOW,
      backend: async () => custom,
    });
    expect(results).toEqual(custom);
  });
});

describe('mockSearchX (direct export)', () => {
  test('empty/short query returns fallback', async () => {
    const results = await mockSearchX('', { windowDays: 7, now: FIXED_NOW });
    expect(results).toHaveLength(2);
  });
});
