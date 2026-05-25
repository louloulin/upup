/**
 * Intent Detector Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  extractTickers,
  detectIntents,
  generateSuggestionMessage,
  IntentDetector,
  type Intent,
} from './intent-detector.js';

describe('Intent Detector', () => {
  // =========================================================================
  // Ticker Extraction Tests
  // =========================================================================
  describe('extractTickers', () => {
    test('extracts A-share codes', () => {
      const tickers = extractTickers('分析贵州茅台 600519');
      expect(tickers.length).toBeGreaterThan(0);
      expect(tickers.some(t => t.code === '600519')).toBe(true);
      expect(tickers.some(t => t.market === 'A-share')).toBe(true);
    });

    test('extracts multiple A-share codes', () => {
      const tickers = extractTickers('对比 600519 和 000858');
      expect(tickers.length).toBeGreaterThanOrEqual(2);
    });

    test('extracts HK codes', () => {
      const tickers = extractTickers('分析腾讯 00700');
      expect(tickers.some(t => t.code === '00700')).toBe(true);
      expect(tickers.some(t => t.market === 'HK')).toBe(true);
    });

    test('extracts US tickers', () => {
      const tickers = extractTickers('分析 Apple AAPL');
      expect(tickers.some(t => t.code === 'AAPL')).toBe(true);
      expect(tickers.some(t => t.market === 'US')).toBe(true);
    });

    test('extracts fund codes', () => {
      const tickers = extractTickers('分析基金 110022');
      expect(tickers.some(t => t.code === '110022' && t.market === 'Fund')).toBe(true);
    });

    test('returns empty for no tickers', () => {
      const tickers = extractTickers('今天天气不错');
      expect(tickers.length).toBe(0);
    });

    test('extracts mixed market tickers', () => {
      const tickers = extractTickers('对比 AAPL 600519 00700');
      expect(tickers.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // Intent Detection Tests
  // =========================================================================
  describe('detectIntents', () => {
    test('detects valuation intent', () => {
      const intents = detectIntents('帮我分析茅台的估值');
      expect(intents.some(i => i.type === 'valuation')).toBe(true);
    });

    test('detects DCF trigger', () => {
      const intents = detectIntents('DCF估值分析');
      expect(intents.some(i => i.type === 'valuation')).toBe(true);
    });

    test('detects technical analysis intent', () => {
      const intents = detectIntents('技术分析走势');
      expect(intents.some(i => i.type === 'technical')).toBe(true);
    });

    test('detects risk intent', () => {
      const intents = detectIntents('风险评估');
      expect(intents.some(i => i.type === 'risk')).toBe(true);
    });

    test('detects fund intent', () => {
      const intents = detectIntents('基金筛选');
      expect(intents.some(i => i.type === 'fund')).toBe(true);
    });

    test('detects command intent', () => {
      const intents = detectIntents('/dcf AAPL');
      expect(intents.some(i => i.type === 'command')).toBe(true);
      expect(intents.find(i => i.type === 'command')?.value).toBe('dcf');
    });

    test('detects ticker with valuation intent', () => {
      const intents = detectIntents('分析贵州茅台600519的估值');
      expect(intents.some(i => i.type === 'ticker')).toBe(true);
      expect(intents.some(i => i.type === 'valuation')).toBe(true);
    });

    test('returns empty for unrelated input', () => {
      const intents = detectIntents('今天吃什么');
      expect(intents.length).toBe(0);
    });

    test('detects multiple intents', () => {
      const intents = detectIntents('分析腾讯的技术面和基本面');
      expect(intents.some(i => i.type === 'technical')).toBe(true);
      expect(intents.some(i => i.type === 'fundamental')).toBe(true);
    });

    test('sorts by confidence', () => {
      const intents = detectIntents('DCF估值分析');
      const valuationIntents = intents.filter(i => i.type === 'valuation');
      expect(valuationIntents.length).toBeGreaterThan(0);
      // First should have highest confidence
      expect(valuationIntents[0].confidence).toBeGreaterThanOrEqual(
        valuationIntents[valuationIntents.length - 1].confidence
      );
    });
  });

  // =========================================================================
  // Suggestion Message Tests
  // =========================================================================
  describe('generateSuggestionMessage', () => {
    test('returns null for empty intents', () => {
      const message = generateSuggestionMessage([]);
      expect(message).toBeNull();
    });

    test('generates suggestion for valuation intent', () => {
      const intents = detectIntents('帮我分析估值');
      const message = generateSuggestionMessage(intents);
      expect(message).toBeTruthy();
      expect(message!.toLowerCase()).toContain('dcf');
    });

    test('includes skill names in suggestion', () => {
      const intents = detectIntents('技术分析');
      const message = generateSuggestionMessage(intents);
      expect(message).toBeTruthy();
      expect(message!.toLowerCase()).toContain('technical');
    });
  });

  // =========================================================================
  // IntentDetector Class Tests
  // =========================================================================
  describe('IntentDetector', () => {
    test('creates with default config', () => {
      const detector = new IntentDetector();
      const config = detector.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.mode).toBe('suggest');
    });

    test('creates with custom config', () => {
      const detector = new IntentDetector({ mode: 'auto' });
      expect(detector.getConfig().mode).toBe('auto');
    });

    test('detects intents', () => {
      const detector = new IntentDetector();
      const intents = detector.detect('DCF估值分析');
      expect(intents.length).toBeGreaterThan(0);
    });

    test('detects with suggestions in suggest mode', () => {
      const detector = new IntentDetector({ mode: 'suggest' });
      const { intents, suggestion } = detector.detectWithSuggestions('估值分析');
      expect(intents.length).toBeGreaterThan(0);
      expect(suggestion).toBeTruthy();
    });

    test('returns no suggestion in manual mode', () => {
      const detector = new IntentDetector({ mode: 'manual' });
      const { suggestion } = detector.detectWithSuggestions('估值分析');
      expect(suggestion).toBeUndefined();
    });

    test('updateConfig works', () => {
      const detector = new IntentDetector();
      detector.updateConfig({ mode: 'auto' });
      expect(detector.getConfig().mode).toBe('auto');
    });

    test('disabled detector returns empty', () => {
      const detector = new IntentDetector({ enabled: false });
      const intents = detector.detect('DCF估值');
      expect(intents.length).toBe(0);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    test('handles empty input', () => {
      const intents = detectIntents('');
      expect(intents.length).toBe(0);
    });

    test('handles whitespace only input', () => {
      const intents = detectIntents('   ');
      expect(intents.length).toBe(0);
    });

    test('handles special characters', () => {
      const intents = detectIntents('分析!!! DCF估值 $$$');
      expect(intents.some(i => i.type === 'valuation')).toBe(true);
    });

    test('handles mixed case', () => {
      const intents = detectIntents('DCF dcf Dcf 估值');
      expect(intents.some(i => i.type === 'valuation')).toBe(true);
    });

    test('handles Chinese punctuation', () => {
      const intents = detectIntents('帮我分析，估值怎么样？');
      expect(intents.some(i => i.type === 'valuation')).toBe(true);
    });
  });
});
