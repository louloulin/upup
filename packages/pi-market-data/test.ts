import { describe, expect, test } from 'bun:test';
import { isTradingDay, makeFixtureBars, makeFixtureQuote } from './src/index.js';

describe('pi-market-data', () => {
  test('produces stable quote evidence', () => {
    const result = makeFixtureQuote('600519.SH', 'cn', 'test-quote');
    expect(result.value).toMatchObject({ symbol: '600519.SH', market: 'cn', currency: 'CNY', asOf: '2026-09-12' });
    expect(result.evidence).toMatchObject({ id: 'market-data:test-quote:quote', dataFreshness: 'historical' });
  });

  test('produces bounded historical bars', () => {
    const result = makeFixtureBars('AAPL', '2026-09-01', 99, 'test-history');
    expect(result.value).toHaveLength(30);
    expect(result.value.every((bar) => bar.high >= bar.close && bar.close >= bar.low)).toBe(true);
  });

  test('handles market calendar boundaries', () => {
    expect(isTradingDay('2026-09-12', 'cn')).toBe(false);
    expect(isTradingDay('2026-09-14', 'cn')).toBe(true);
    expect(isTradingDay('2026-10-01', 'cn')).toBe(false);
  });
});
