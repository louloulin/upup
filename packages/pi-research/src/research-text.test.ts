import { describe, expect, test } from 'bun:test';
import {
  analyzeSentimentToolResult,
  detectEventsToolResult,
  extractEntitiesToolResult,
} from './research-text.js';

describe('Pi research text tool results', () => {
  test('returns structured sentiment output', () => {
    const result = JSON.parse(analyzeSentimentToolResult({
      text: 'Revenue beat expectations and profit growth accelerated.',
    }));
    expect(result.data.sentiment).toBe('positive');
    expect(result.data.score).toBeGreaterThan(0);
  });

  test('returns event counts and extracted values', () => {
    const result = JSON.parse(detectEventsToolResult(
      'The company acquired a competitor after beating earnings estimates.',
    ));
    expect(result.data.count).toBeGreaterThan(0);
    expect(result.data.events.length).toBeGreaterThan(0);
  });

  test('extracts tickers, periods, percentages, and dates', () => {
    const result = JSON.parse(extractEntitiesToolResult(
      'AAPL Q3 revenue grew 12.5% on 2024-03-15.',
    ));
    expect(result.data.stocks).toContain('AAPL');
    expect(result.data.periods.some((period: string) => /Q3/i.test(period))).toBe(true);
    expect(result.data.percentages).toContain('12.5%');
    expect(result.data.dates.length).toBeGreaterThan(0);
  });
});
