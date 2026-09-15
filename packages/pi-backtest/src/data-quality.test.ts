import { describe, expect, test } from 'bun:test';
import { validateForwardBars } from './data-quality';

const validBars = [
  { date: '2026-01-05', high: 105, low: 99, close: 104 },
  { date: '2026-01-06', high: 110, low: 103, close: 108 },
  { date: '2026-01-07', high: 112, low: 106, close: 110 },
];

describe('Pi backtest data quality', () => {
  test('accepts ordered trading-day bars bounded by as-of date', () => {
    expect(validateForwardBars('2026-01-02', validBars, { asOfDate: '2026-01-07' })).toMatchObject({ status: 'passed', acceptedBarCount: 3, tradingDayCount: 3, lastBarDate: '2026-01-07' });
  });

  test('rejects weekend, duplicate, malformed, and future bars', () => {
    const result = validateForwardBars('2026-01-02', [
      { date: '2026-01-03', high: 10, low: 9, close: 9.5 },
      { date: '2026-01-06', high: 8, low: 9, close: 8.5 },
      { date: '2026-01-06', high: 10, low: 8, close: 9 },
      { date: '2026-01-08', high: 11, low: 10, close: 10.5 },
    ], { asOfDate: '2026-01-07' });
    expect(result.status).toBe('failed');
    expect(result.issues).toEqual(expect.arrayContaining([
      'bar[0].date is not a trading day',
      'bar[1].high must not be lower than low',
      'bars must be strictly ordered and unique at 2026-01-06',
      'bar[3].date is after asOfDate',
    ]));
  });

  test('permissive mode is explicit and does not hide the selected as-of date', () => {
    expect(validateForwardBars('not-a-date', [{ date: '2026-01-03' }], { mode: 'permissive', asOfDate: '2026-01-03' })).toMatchObject({ status: 'passed', mode: 'permissive', asOfDate: '2026-01-03', acceptedBarCount: 1 });
  });
});

