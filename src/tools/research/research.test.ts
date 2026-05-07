/**
 * Research Tools Integration Test
 */

import { describe, expect, test } from 'bun:test';
import { analyzeSentiment, detectEvents, extractEntities } from './research-tools.js';

describe('Research Tools', () => {
  describe('analyzeSentiment', () => {
    test('should detect positive sentiment', () => {
      const result = analyzeSentiment('Apple Q3 earnings beat expectations with strong growth');
      expect(result.label).toBe('positive');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should detect negative sentiment', () => {
      const result = analyzeSentiment('Company reports huge loss, stock crashes, bankruptcy risk');
      expect(result.label).toBe('negative');
      expect(result.score).toBeLessThan(0);
    });

    test('should detect neutral sentiment', () => {
      const result = analyzeSentiment('Company maintains current guidance');
      expect(result.label).toBe('neutral');
    });

    test('should support Chinese keywords', () => {
      const result = analyzeSentiment('公司业绩超预期，增长强劲');
      expect(result.label).toBe('positive');
    });
  });

  describe('detectEvents', () => {
    test('should detect earnings events', () => {
      const events = detectEvents('Q3 earnings report shows revenue growth');
      expect(events.some(e => e.type === 'earnings')).toBe(true);
    });

    test('should detect M&A events', () => {
      const events = detectEvents('Company announces acquisition of startup');
      expect(events.some(e => e.type === 'ma')).toBe(true);
    });

    test('should detect regulatory events', () => {
      const events = detectEvents('FDA approves new drug application');
      expect(events.some(e => e.type === 'regulatory')).toBe(true);
    });

    test('should detect multiple events', () => {
      const events = detectEvents('Q3 earnings beat, company announces acquisition');
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extractEntities', () => {
    test('should extract stock tickers', () => {
      const result = extractEntities('AAPL and GOOGL stock prices');
      expect(result.stocks).toContain('AAPL');
      expect(result.stocks).toContain('GOOGL');
    });

    test('should extract numbers with units', () => {
      const result = extractEntities('Revenue was 100亿元 with growth of 25%');
      expect(result.numbers.length).toBeGreaterThan(0);
    });

    test('should extract dates', () => {
      const result = extractEntities('Report dated 2024-01-15 shows earnings');
      expect(result.dates.length).toBeGreaterThan(0);
    });
  });
});
