/**
 * Tests for NormalizedEvent schema + AltDataAdapter interface.
 */

import { describe, expect, test } from 'bun:test';
import { AltDataError, normalizeEvent, type RawEvent } from './types.js';

describe('normalizeEvent', () => {
  test('produces sha256 id from source+url+publishedAt', () => {
    const raw: RawEvent = {
      source: 'dragon-tiger',
      title: '中信证券上海分公司 买入 600519.SH 1.2亿',
      url: 'https://data.eastmoney.com/stock/lhb/600519.html',
      publishedAt: 1717480800000,
      symbols: ['600519.SH'],
      sentiment: 'positive',
      raw: { buyAmount: 1.2e8, branch: '中信证券上海分公司' },
    };
    const event = normalizeEvent(raw);
    expect(event.id).toMatch(/^[a-f0-9]{64}$/);
    expect(event.source).toBe('dragon-tiger');
    expect(event.sentiment).toBe('positive');
    expect(event.symbols).toEqual(['600519.SH']);
  });

  test('same (source, url, publishedAt) yields same id (dedup key)', () => {
    const raw1: RawEvent = { source: 'dragon-tiger', title: 'A', url: 'https://x', publishedAt: 1000, symbols: [], raw: {} };
    const raw2: RawEvent = { source: 'dragon-tiger', title: 'B (different)', url: 'https://x', publishedAt: 1000, symbols: ['S'], raw: { foo: 1 } };
    expect(normalizeEvent(raw1).id).toBe(normalizeEvent(raw2).id);
  });

  test('default sentiment is null when omitted', () => {
    const raw: RawEvent = { source: 'north-bound', title: 't', url: 'u', publishedAt: 1, symbols: [], raw: {} };
    expect(normalizeEvent(raw).sentiment).toBeNull();
  });
});

describe('AltDataError', () => {
  test('carries code + message', () => {
    const e = new AltDataError('NO_CREDENTIALS', 'foo');
    expect(e.code).toBe('NO_CREDENTIALS');
    expect(e.message).toBe('foo');
    expect(e.name).toBe('AltDataError');
  });
});
