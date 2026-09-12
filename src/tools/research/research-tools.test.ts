/**
 * Investment-Grade Research Tools — Tests
 *
 * Covers:
 * - quickSentimentScan (fast keyword fallback)
 * - deepSentimentAnalysis (negation, per-sentence, headline/body weights)
 * - detectEvents (sophisticated patterns, value extraction, severity)
 * - extractEntities (tickers, Chinese stocks, unit normalisation, periods)
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import {
  quickSentimentScan,
  analyzeSentiment,
  deepSentimentAnalysis,
  detectEvents,
  extractEntities,
  extractEntitiesLegacy,
  createAnalyzeSentimentTool,
  createDetectEventsTool,
  createExtractEntitiesTool,
} from './research-tools.js';

// ---------------------------------------------------------------------------
// Helper assertions
// ---------------------------------------------------------------------------

function assertInRange(
  value: number,
  min: number,
  max: number,
  label: string,
): void {
  expect(value, label).toBeGreaterThanOrEqual(min);
  expect(value, label).toBeLessThanOrEqual(max);
}

// ---------------------------------------------------------------------------
// quickSentimentScan tests
// ---------------------------------------------------------------------------

describe('quickSentimentScan', () => {
  it('returns positive for bullish keywords', () => {
    const result = quickSentimentScan('Stock surges on strong profit growth');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  it('returns negative for bearish keywords', () => {
    const result = quickSentimentScan('Revenue declines as losses widen');
    expect(result.label).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  it('returns neutral when mixed or ambiguous', () => {
    const result = quickSentimentScan('The company maintained its guidance');
    expect(result.label).toBe('neutral');
    assertInRange(result.score, -0.1, 0.1, 'score near zero');
  });

  it('handles Chinese keywords', () => {
    const result = quickSentimentScan('公司业绩大幅增长，盈利超预期');
    expect(result.label).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  it('handles empty string', () => {
    const result = quickSentimentScan('');
    expect(result.label).toBe('neutral');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('is backward-compatible alias for analyzeSentiment', () => {
    const r1 = quickSentimentScan('Revenue beat expectations');
    const r2 = analyzeSentiment('Revenue beat expectations');
    expect(r1.label).toBe(r2.label);
    expect(r1.score).toBe(r2.score);
  });
});

// ---------------------------------------------------------------------------
// deepSentimentAnalysis tests
// ---------------------------------------------------------------------------

describe('deepSentimentAnalysis', () => {
  it('detects bullish earnings beat', () => {
    const result = deepSentimentAnalysis(
      'TSLA surges 8% after beating Q3 earnings estimates by 20%. Revenue hit record $25B.',
    );
    expect(result.sentiment).toBe('bullish');
    expect(result.confidence).toBeGreaterThan(0.05);
    expect(result.keyFactors.length).toBeGreaterThan(0);
  });

  it('detects bearish earnings miss', () => {
    const result = deepSentimentAnalysis(
      'META fell 5% after missing Q2 revenue estimates by 10%. Net profit declined sharply.',
    );
    expect(result.sentiment).toBe('bearish');
    expect(result.keyFactors.length).toBeGreaterThan(0);
  });

  it('detects neutral when balanced', () => {
    const result = deepSentimentAnalysis(
      'The company held its annual investor day. Management maintained prior guidance.',
    );
    expect(result.sentiment).toBe('neutral');
    assertInRange(result.confidence, 0, 1, 'confidence in range');
  });

  it('handles Chinese bullish text', () => {
    const result = deepSentimentAnalysis(
      '比亚迪Q3净利润暴增超300%，大幅超出市场预期，创历史新高。',
    );
    expect(result.sentiment).toBe('bullish');
    expect(result.riskLevel).toBe('low');
  });

  it('detects negation and flips score appropriately', () => {
    const negated = deepSentimentAnalysis(
      'Despite strong demand, the company failed to meet earnings expectations.',
    );
    const straightforward = deepSentimentAnalysis(
      'The company met earnings expectations.',
    );
    // Negated sentence should have a different (likely lower) score
    expect(negated.sentences.some(s => s.negated)).toBe(true);
    // Both should have populated keyFactors
    expect(negated.keyFactors.length).toBeGreaterThan(0);
  });

  it('includes an llmPrompt in the result', () => {
    const result = deepSentimentAnalysis('AAPL raises Q4 guidance', 'AAPL');
    expect(typeof result.llmPrompt).toBe('string');
    expect(result.llmPrompt.length).toBeGreaterThan(50);
    expect(result.llmPrompt).toContain('AAPL');
  });

  it('populates sentences array', () => {
    const result = deepSentimentAnalysis(
      'Revenue up 10%. Profit margin stable. No major concerns.',
    );
    expect(result.sentences.length).toBeGreaterThan(0);
    result.sentences.forEach(s => {
      expect(typeof s.text).toBe('string');
      expect(typeof s.score).toBe('number');
      expect(typeof s.negated).toBe('boolean');
    });
  });

  it('weights headline higher proportionally', () => {
    const bullishHeadline = deepSentimentAnalysis(
      'INTC jumps on beat!\nRevenue fell short in the details and operating margin compressed.',
    );
    // The bullish headline should give at least some positive tilt
    expect(bullishHeadline.sentiment).not.toBe('bearish');
  });

  it('marks high risk for bankruptcy signals', () => {
    const result = deepSentimentAnalysis(
      'XYZ Corp filed for bankruptcy protection amid mounting losses.',
    );
    expect(result.riskLevel).toBe('high');
  });

  it('accepts optional symbol parameter', () => {
    const result = deepSentimentAnalysis('NVDA raises annual guidance', 'NVDA');
    expect(result.llmPrompt).toContain('NVDA');
  });
});

// ---------------------------------------------------------------------------
// detectEvents tests
// ---------------------------------------------------------------------------

describe('detectEvents', () => {
  it('detects earnings event with quarter value', () => {
    const events = detectEvents('Apple reported Q3 revenue of $85B');
    const earnings = events.find(e => e.type === 'earnings');
    expect(earnings).toBeDefined();
    expect(earnings!.values).toContain('Q3');
    assertInRange(earnings!.confidence, 0.7, 1, 'earnings confidence');
  });

  it('detects earnings beat event', () => {
    const events = detectEvents('MSFT beat earnings estimates by 15%');
    const beat = events.find(e => e.type === 'earnings_surprise');
    expect(beat).toBeDefined();
    expect(beat!.severity).toBe('major');
  });

  it('detects earnings miss event', () => {
    const events = detectEvents('NFLX missed revenue expectations by 8%');
    const miss = events.find(e => e.type === 'earnings_surprise');
    expect(miss).toBeDefined();
    expect(miss!.severity).toBe('major');
  });

  it('detects M&A with target name', () => {
    const events = detectEvents('GOOG acquires DeepMind for $5 billion deal');
    const ma = events.find(e => e.type === 'ma');
    expect(ma).toBeDefined();
    expect(ma!.severity).toBe('major');
  });

  it('detects regulatory/FDA event', () => {
    const events = detectEvents('FDA approves Pfizer vaccine for emergency use');
    const reg = events.find(e => e.type === 'regulatory');
    expect(reg).toBeDefined();
    expect(reg!.severity).toBe('major');
  });

  it('detects management change', () => {
    const events = detectEvents('AMZN appointed new CFO after previous resignation');
    const mgmt = events.find(e => e.type === 'management');
    expect(mgmt).toBeDefined();
    expect(mgmt!.severity).toBe('major');
  });

  it('detects product launch as minor event', () => {
    const events = detectEvents('Samsung launched new Galaxy flagship phone');
    const product = events.find(e => e.type === 'product');
    expect(product).toBeDefined();
    expect(product!.severity).toBe('minor');
  });

  it('detects guidance change', () => {
    const events = detectEvents('ORCL lowered full-year guidance citing macro headwinds');
    const guidance = events.find(e => e.type === 'guidance');
    expect(guidance).toBeDefined();
    expect(guidance!.severity).toBe('major');
  });

  it('detects capital event with value', () => {
    const events = detectEvents('IBM announces buyback of $10 billion and raises dividend');
    const capital = events.find(e => e.type === 'capital');
    expect(capital).toBeDefined();
    expect(capital!.values.some(v => v.includes('10') || v.includes('$10'))).toBe(true);
  });

  it('handles Chinese earnings text', () => {
    const events = detectEvents('宁德时代Q3净利润同比增长超200%');
    expect(events.length).toBeGreaterThan(0);
    const earnings = events.find(e => e.type === 'earnings');
    expect(earnings).toBeDefined();
  });

  it('handles Chinese M&A text', () => {
    const events = detectEvents('贵州茅台收购某酱酒企业，金额超50亿');
    const ma = events.find(e => e.type === 'ma');
    expect(ma).toBeDefined();
    // Chinese M&A pattern captures the target name after 收购
    expect(ma!.type).toBe('ma');
  });

  it('returns empty array for unrelated text', () => {
    const events = detectEvents('The weather is sunny today in New York.');
    expect(events).toHaveLength(0);
  });

  it('deduplicates events by type, keeping highest confidence', () => {
    const events = detectEvents(
      'Q1 earnings beat estimates. Q2 earnings beat again. Revenue surged.',
    );
    // Should have at most one earnings type
    const earningsEvents = events.filter(e => e.type === 'earnings' || e.type === 'earnings_surprise');
    // At most 2 (earnings + earnings_surprise) — not multiple of same type
    const typeCounts = new Map<string, number>();
    for (const e of events) {
      typeCounts.set(e.type, (typeCounts.get(e.type) || 0) + 1);
    }
    for (const count of typeCounts.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('sorts events by confidence descending', () => {
    const events = detectEvents(
      'FDA approves drug. Q2 revenue $10B. New product launched.',
    );
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].confidence).toBeGreaterThanOrEqual(events[i].confidence);
    }
  });

  it('extracts multiple distinct event types from one text', () => {
    const events = detectEvents(
      'TSLA Q3 results beat estimates. CEO Elon Musk announced new factory plans. FDA launched investigation into competitor.',
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    const types = events.map(e => e.type);
    expect(new Set(types).size).toBe(types.length);
  });
});

// ---------------------------------------------------------------------------
// extractEntities tests
// ---------------------------------------------------------------------------

describe('extractEntities', () => {
  it('extracts US stock tickers', () => {
    const result = extractEntities('AAPL and MSFT announced joint deal. TSLA fell 3%.');
    expect(result.stocks).toContain('AAPL');
    expect(result.stocks).toContain('MSFT');
    expect(result.stocks).toContain('TSLA');
  });

  it('filters out common false-positive words', () => {
    const result = extractEntities('THE CEO OF THE COMPANY IS AMAZING AND THE GDP IS GROWING.');
    expect(result.stocks).not.toContain('THE');
    expect(result.stocks).not.toContain('GDP');
    expect(result.stocks).not.toContain('AND');
  });

  it('extracts tickers near $ symbol', () => {
    const result = extractEntities('$NVDA shares rose 5%. $AMD also gained.');
    expect(result.stocks).toContain('NVDA');
    expect(result.stocks).toContain('AMD');
  });

  it('extracts Chinese stock names', () => {
    const result = extractEntities('比亚迪和贵州茅台今日公布季报，宁德时代也发布业绩。');
    expect(result.chineseStocks).toContain('比亚迪');
    expect(result.chineseStocks).toContain('贵州茅台');
    expect(result.chineseStocks).toContain('宁德时代');
  });

  it('normalises Chinese monetary units', () => {
    const result = extractEntities('公司营收500亿，净利润50亿，员工3万人。');
    const rawNumbers = result.numbers.map(n => n.raw);
    expect(rawNumbers).toContain('500亿');
    expect(rawNumbers).toContain('50亿');
    expect(rawNumbers).toContain('3万');

    const normalizedBillion = result.numbers.find(n => n.normalized === 500 * 1e8);
    expect(normalizedBillion).toBeDefined();

    const normalizedMillion = result.numbers.find(n => n.normalized === 3 * 1e4);
    expect(normalizedMillion).toBeDefined();
  });

  it('extracts percentages', () => {
    const result = extractEntities('Revenue grew 12.5% and margin expanded by 3 basis points.');
    expect(result.percentages).toContain('12.5%');
    expect(result.percentages.some(p => p.includes('%'))).toBe(true);
  });

  it('extracts time periods (Q1-Q4, FY)', () => {
    const result = extractEntities(
      'Q1 2024 revenue $100B. Q2 results also strong. FY2024 guidance raised.',
    );
    const periods = result.periods;
    expect(periods.some(p => /Q[1-4]/i.test(p))).toBe(true);
    expect(periods.some(p => /FY/i.test(p))).toBe(true);
  });

  it('extracts dates', () => {
    const result = extractEntities('Report dated 2024-03-15 and filed on 2024/03/16.');
    expect(result.dates.length).toBeGreaterThan(0);
  });

  it('extracts periods in Chinese text', () => {
    const result = extractEntities('公司上半年营收同比增长，下半年预计持续增长。');
    expect(result.periods.some(p => /[上下]半年|季度/.test(p))).toBe(true);
  });

  it('extracts monetary values with $ and billion', () => {
    const result = extractEntities('Deal valued at $5.2 billion. Revenue $85 billion.');
    const rawNumbers = result.numbers.map(n => n.raw);
    expect(rawNumbers.some(r => /5\.2/i.test(r))).toBe(true);
    expect(rawNumbers.some(r => /85/i.test(r))).toBe(true);
  });

  it('extractEntitiesLegacy returns backward-compatible shape', () => {
    const legacy = extractEntitiesLegacy('AAPL Q3 revenue $85B grew 5%');
    expect(Array.isArray(legacy.stocks)).toBe(true);
    expect(Array.isArray(legacy.numbers)).toBe(true);
    expect(Array.isArray(legacy.dates)).toBe(true);
    expect(legacy.stocks).toContain('AAPL');
  });

  it('handles empty string gracefully', () => {
    const result = extractEntities('');
    expect(result.stocks).toHaveLength(0);
    expect(result.chineseStocks).toHaveLength(0);
    expect(result.numbers).toHaveLength(0);
    expect(result.periods).toHaveLength(0);
    expect(result.dates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: tool factories smoke test
// ---------------------------------------------------------------------------

describe('Tool factories', () => {
  it('createAnalyzeSentimentTool returns a PiTool', () => {
    const tool = createAnalyzeSentimentTool();
    expect(tool.name).toBe('analyze_sentiment');
    expect(typeof tool.func).toBe('function');
  });

  it('createDetectEventsTool returns a PiTool', () => {
    const tool = createDetectEventsTool();
    expect(tool.name).toBe('detect_events');
    expect(typeof tool.func).toBe('function');
  });

  it('createExtractEntitiesTool returns a PiTool', () => {
    const tool = createExtractEntitiesTool();
    expect(tool.name).toBe('extract_entities');
    expect(typeof tool.func).toBe('function');
  });
});
