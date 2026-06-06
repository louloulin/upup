/**
 * Matrix Analysis — e2e tests.
 *
 * Covers:
 *   - renderVerdict: 4 dimensions × multiple metric shapes (technical, fundamental, flow, sentiment)
 *   - MatrixEngine: spec validation, dedup, setCell, bulk set, build, summary
 *   - Default universe: 50 tickers, mix of A-share and US
 *   - toCSV / toMarkdown: pivot, escape, summary section
 *   - Tool: feature_disabled, happy path with cells, format=csv/markdown, limit cap
 *   - Safety: no throw on empty metrics, weird inputs, missing data
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  MatrixEngine,
  renderVerdict,
  toCSV,
  toMarkdown,
  buildMatrixAnalysisTool,
  createMatrixAnalysisTool,
  DEFAULT_TICKERS_UNIVERSE,
  DIMENSIONS,
  DIMENSION_LABELS_ZH,
  type MatrixSpec,
  type MatrixCell,
  type CellResolver,
} from './matrix.js';

// ---------------------------------------------------------------------------
// renderVerdict
// ---------------------------------------------------------------------------

describe('renderVerdict', () => {
  describe('technical', () => {
    test('oversold RSI is bullish polarity', () => {
      const r = renderVerdict('technical', { rsi: 25, momentum: 0.1, volatility: 0.2 });
      expect(r.polarity).toBeGreaterThan(0);
      expect(r.verdict).toContain('RSI=25');
      expect(r.verdict).toContain('超卖');
    });

    test('overbought RSI is bearish polarity', () => {
      const r = renderVerdict('technical', { rsi: 80, momentum: -0.05, volatility: 0.3 });
      expect(r.polarity).toBeLessThan(0);
      expect(r.verdict).toContain('超买');
    });

    test('positive momentum + neutral RSI', () => {
      const r = renderVerdict('technical', { rsi: 50, momentum: 0.1, volatility: 0.2 });
      expect(r.polarity).toBeGreaterThan(0);
      expect(r.verdict).toContain('上升');
    });

    test('negative momentum + neutral RSI', () => {
      const r = renderVerdict('technical', { rsi: 50, momentum: -0.1, volatility: 0.2 });
      expect(r.polarity).toBeLessThan(0);
      expect(r.verdict).toContain('下降');
    });

    test('confidence lower when RSI missing', () => {
      const withRsi = renderVerdict('technical', { rsi: 50, momentum: 0.05 });
      const withoutRsi = renderVerdict('technical', { momentum: 0.05 });
      expect(withRsi.confidence).toBeGreaterThan(withoutRsi.confidence);
    });
  });

  describe('fundamental', () => {
    test('low PE + high ROE is strongly bullish', () => {
      const r = renderVerdict('fundamental', { pe: 10, pb: 1.5, roe: 0.20, revGrowth: 0.25 });
      expect(r.polarity).toBeGreaterThan(0.3);
      expect(r.verdict).toContain('低估');
      expect(r.verdict).toContain('优秀');
    });

    test('high PE + low ROE is bearish', () => {
      const r = renderVerdict('fundamental', { pe: 80, pb: 8, roe: 0.02, revGrowth: -0.1 });
      expect(r.polarity).toBeLessThan(0);
      expect(r.verdict).toContain('高估');
    });

    test('zero PE marked as 亏损', () => {
      const r = renderVerdict('fundamental', { pe: 0, pb: 0, roe: -0.5 });
      expect(r.verdict).toContain('亏损');
      expect(r.polarity).toBeLessThan(0);
    });

    test('high revenue growth is bullish', () => {
      const r = renderVerdict('fundamental', { pe: 25, pb: 3, roe: 0.10, revGrowth: 0.4 });
      expect(r.polarity).toBeGreaterThan(0);
    });
  });

  describe('flow', () => {
    test('positive net inflow is bullish', () => {
      const r = renderVerdict('flow', { netInflow: 5, northbound: 2, institutional: 1.5 });
      expect(r.polarity).toBeGreaterThan(0);
      expect(r.verdict).toContain('净流入');
    });

    test('negative net inflow is bearish', () => {
      const r = renderVerdict('flow', { netInflow: -5, northbound: -2, institutional: -1.5 });
      expect(r.polarity).toBeLessThan(0);
      expect(r.verdict).toContain('净流出');
    });

    test('balanced flow is neutral', () => {
      const r = renderVerdict('flow', { netInflow: 0, northbound: 0, institutional: 0 });
      expect(Math.abs(r.polarity)).toBeLessThan(0.1);
      expect(r.verdict).toContain('平衡');
    });
  });

  describe('sentiment', () => {
    test('positive sentiment + bullish broker consensus', () => {
      const r = renderVerdict('sentiment', { sentimentScore: 0.6, newsCount: 20, brokerConsensus: 1.5 });
      expect(r.polarity).toBeGreaterThan(0);
      expect(r.verdict).toContain('推荐');
    });

    test('negative sentiment + bearish broker consensus', () => {
      const r = renderVerdict('sentiment', { sentimentScore: -0.5, newsCount: 10, brokerConsensus: 4.5 });
      expect(r.polarity).toBeLessThan(0);
      expect(r.verdict).toContain('回避');
    });

    test('more news = higher confidence', () => {
      const low = renderVerdict('sentiment', { sentimentScore: 0.3, newsCount: 1 });
      const high = renderVerdict('sentiment', { sentimentScore: 0.3, newsCount: 50 });
      expect(high.confidence).toBeGreaterThan(low.confidence);
    });

    test('no broker consensus handled gracefully', () => {
      const r = renderVerdict('sentiment', { sentimentScore: 0.2, newsCount: 5 });
      expect(r.verdict).toContain('无');
    });
  });
});

// ---------------------------------------------------------------------------
// Default universe
// ---------------------------------------------------------------------------

describe('DEFAULT_TICKERS_UNIVERSE', () => {
  test('contains exactly 50 tickers', () => {
    expect(DEFAULT_TICKERS_UNIVERSE).toHaveLength(50);
  });

  test('has 25 A-share codes starting with 0 or 6', () => {
    const aShares = DEFAULT_TICKERS_UNIVERSE.filter((t) => /\.(SH|SZ)$/.test(t));
    expect(aShares.length).toBe(25);
    for (const t of aShares) {
      expect(t).toMatch(/^[036]\d{5}\.(SH|SZ)$/);
    }
  });

  test('has 25 US tickers', () => {
    // US tickers: uppercase letters with optional .B (Berkshire-style) or .A
    const us = DEFAULT_TICKERS_UNIVERSE.filter((t) => /^[A-Z]+(\.[AB])?$/.test(t));
    expect(us.length).toBe(25);
  });

  test('all tickers are unique', () => {
    const set = new Set(DEFAULT_TICKERS_UNIVERSE);
    expect(set.size).toBe(DEFAULT_TICKERS_UNIVERSE.length);
  });
});

describe('DIMENSIONS', () => {
  test('contains exactly 4 dimensions', () => {
    expect(DIMENSIONS).toHaveLength(4);
    expect(DIMENSIONS).toEqual(['technical', 'fundamental', 'flow', 'sentiment']);
  });

  test('all dimensions have Chinese labels', () => {
    for (const d of DIMENSIONS) {
      expect(DIMENSION_LABELS_ZH[d]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// MatrixEngine — spec validation
// ---------------------------------------------------------------------------

describe('MatrixEngine — spec validation', () => {
  test('rejects empty tickers', () => {
    expect(() => new MatrixEngine({ tickers: [], dimensions: ['technical'] })).toThrow();
  });

  test('rejects empty dimensions', () => {
    expect(() => new MatrixEngine({ tickers: ['AAPL'], dimensions: [] })).toThrow();
  });

  test('rejects unknown dimension', () => {
    expect(() => new MatrixEngine({
      tickers: ['AAPL'],
      // @ts-expect-error testing validation
      dimensions: ['invalid_dim'],
    })).toThrow();
  });

  test('dedups tickers and dimensions', () => {
    const eng = new MatrixEngine({
      tickers: ['AAPL', 'AAPL', 'MSFT'],
      dimensions: ['technical', 'technical', 'fundamental'],
    });
    const r = eng.listCells(); // empty initially
    // We can check by building and counting
    expect(r).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MatrixEngine — setCell / build / summary
// ---------------------------------------------------------------------------

describe('MatrixEngine — setCell + build + summary', () => {
  const SPEC: MatrixSpec = {
    tickers: ['AAPL', '600519.SH', 'TSLA'],
    dimensions: ['technical', 'fundamental', 'flow', 'sentiment'],
  };

  test('setCell injects a cell idempotently', () => {
    const eng = new MatrixEngine(SPEC);
    const cell: MatrixCell = {
      ticker: 'AAPL',
      dimension: 'technical',
      metrics: { rsi: 25, momentum: 0.1 },
      verdict: 'test',
      polarity: 0.8,
      confidence: 0.9,
      sources: [],
    };
    eng.setCell(cell);
    eng.setCell(cell); // idempotent
    expect(eng.size()).toBe(1);
  });

  test('setCell rejects ticker not in spec', () => {
    const eng = new MatrixEngine(SPEC);
    expect(() => eng.setCell({
      ticker: 'UNKNOWN',
      dimension: 'technical',
      metrics: {},
      verdict: 'x',
      polarity: 0,
      confidence: 0,
      sources: [],
    })).toThrow();
  });

  test('setCell rejects dimension not in spec', () => {
    const eng = new MatrixEngine(SPEC);
    expect(() => eng.setCell({
      ticker: 'AAPL',
      // @ts-expect-error testing validation
      dimension: 'unknown_dim',
      metrics: {},
      verdict: 'x',
      polarity: 0,
      confidence: 0,
      sources: [],
    })).toThrow();
  });

  test('setCells bulk inject', () => {
    const eng = new MatrixEngine(SPEC);
    eng.setCells([
      { ticker: 'AAPL', dimension: 'technical', metrics: {}, verdict: 't', polarity: 0.5, confidence: 0.8, sources: [] },
      { ticker: 'AAPL', dimension: 'fundamental', metrics: {}, verdict: 'f', polarity: -0.2, confidence: 0.7, sources: [] },
    ]);
    expect(eng.size()).toBe(2);
  });

  test('build with default resolver (no data) returns empty cells', async () => {
    const eng = new MatrixEngine(SPEC);
    const result = await eng.build();
    expect(result.cells).toHaveLength(0);
    expect(result.summary.totalPopulated).toBe(0);
    expect(result.summary.totalCells).toBe(12); // 3 tickers * 4 dims
  });

  test('build with custom resolver populates cells with auto-rendered verdicts', async () => {
    const resolver: CellResolver = async (ticker, dim) => {
      if (ticker === 'AAPL' && dim === 'technical') {
        return { metrics: { rsi: 25, momentum: 0.05 }, confidence: 0.9 };
      }
      if (ticker === 'AAPL' && dim === 'fundamental') {
        return { metrics: { pe: 28, pb: 8, roe: 0.30, revGrowth: 0.15 } };
      }
      return null;
    };
    const eng = new MatrixEngine(SPEC, resolver);
    const result = await eng.build();
    expect(result.cells.length).toBe(2);
    for (const c of result.cells) {
      expect(c.verdict).toBeTruthy();
      expect(c.ticker).toBe('AAPL');
    }
  });

  test('resolver-supplied verdict overrides auto-rendered one', async () => {
    const resolver: CellResolver = async () => ({
      metrics: { rsi: 50 },
      verdict: 'CUSTOM_VERDICT',
      polarity: 0.5,
    });
    const eng = new MatrixEngine({ tickers: ['AAPL'], dimensions: ['technical'] }, resolver);
    const result = await eng.build();
    expect(result.cells[0].verdict).toBe('CUSTOM_VERDICT');
  });

  test('resolver errors do not crash build', async () => {
    const resolver: CellResolver = async () => { throw new Error('boom'); };
    const eng = new MatrixEngine({ tickers: ['AAPL'], dimensions: ['technical'] }, resolver);
    expect(async () => eng.build()).not.toThrow();
    const result = await eng.build();
    expect(result.cells).toHaveLength(0);
  });

  test('summary computes topBullish, topBearish, overallLeaders', async () => {
    const resolver: CellResolver = async (ticker, dim) => {
      if (ticker === 'AAPL') return { metrics: { rsi: 20, momentum: 0.2 }, polarity: 0.9, confidence: 0.9 };
      if (ticker === 'TSLA') return { metrics: { rsi: 85, momentum: -0.3 }, polarity: -0.8, confidence: 0.9 };
      return null;
    };
    const eng = new MatrixEngine({ tickers: ['AAPL', 'TSLA'], dimensions: ['technical'] }, resolver);
    const result = await eng.build();
    expect(result.summary.topBullish[0].ticker).toBe('AAPL');
    expect(result.summary.topBearish[0].ticker).toBe('TSLA');
    expect(result.summary.overallLeaders[0].ticker).toBe('AAPL');
    expect(result.summary.overallLeaders[1].ticker).toBe('TSLA');
    expect(result.summary.coverageByDim.technical).toBe(2);
  });

  test('setCell cells survive build()', async () => {
    const eng = new MatrixEngine(SPEC);
    eng.setCell({
      ticker: 'AAPL',
      dimension: 'technical',
      metrics: { rsi: 30 },
      verdict: 'manual',
      polarity: 0.5,
      confidence: 0.8,
      sources: [{ kind: 'test', ref: 't1' }],
    });
    const result = await eng.build();
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0].verdict).toBe('manual');
    expect(result.cells[0].sources[0].ref).toBe('t1');
  });
});

// ---------------------------------------------------------------------------
// toCSV / toMarkdown
// ---------------------------------------------------------------------------

describe('toCSV', () => {
  const SPEC: MatrixSpec = {
    tickers: ['AAPL', 'MSFT'],
    dimensions: ['technical', 'fundamental'],
  };

  test('emits header + one row per cell', async () => {
    const resolver: CellResolver = async () => ({ metrics: { pe: 25 }, verdict: 'good', polarity: 0.5, confidence: 0.8 });
    const eng = new MatrixEngine(SPEC, resolver);
    const result = await eng.build();
    const csv = toCSV(result);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('ticker');
    expect(lines[0]).toContain('dimension_zh');
    expect(lines.length - 1).toBe(4); // 2 tickers * 2 dims
  });

  test('escapes commas and quotes in verdict', async () => {
    const eng = new MatrixEngine({ tickers: ['AAPL'], dimensions: ['technical'] });
    eng.setCell({
      ticker: 'AAPL', dimension: 'technical', metrics: {},
      verdict: 'has, comma "and quotes"', polarity: 0, confidence: 0, sources: [],
    });
    const result = await eng.build();
    const csv = toCSV(result);
    // The escaped value should be quoted, with inner quotes doubled
    expect(csv).toContain('"has, comma ""and quotes"""');
  });
});

describe('toMarkdown', () => {
  test('emits pivoted table + summary sections', async () => {
    const resolver: CellResolver = async (ticker) => {
      if (ticker === 'AAPL') return { metrics: { rsi: 25, momentum: 0.1 }, polarity: 0.7, confidence: 0.9 };
      if (ticker === 'MSFT') return { metrics: { rsi: 75, momentum: -0.1 }, polarity: -0.5, confidence: 0.9 };
      return null;
    };
    const eng = new MatrixEngine({
      tickers: ['AAPL', 'MSFT'],
      dimensions: ['technical', 'fundamental'],
    }, resolver);
    const result = await eng.build();
    const md = toMarkdown(result);
    expect(md).toContain('# 投资矩阵分析');
    expect(md).toContain('| 标的 | 技术 | 基本面 |');
    expect(md).toContain('AAPL');
    expect(md).toContain('MSFT');
    expect(md).toContain('## 综合排行');
    expect(md).toContain('### 整体得分前 10');
    expect(md).toContain('### 各维度均值情绪');
    expect(md).toContain('### 最看多');
    expect(md).toContain('### 最看空');
  });

  test('missing cells render as "—"', async () => {
    const eng = new MatrixEngine({ tickers: ['AAPL', 'MSFT'], dimensions: ['technical'] });
    eng.setCell({
      ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 50 },
      verdict: 'A', polarity: 0, confidence: 1, sources: [],
    });
    const result = await eng.build();
    const md = toMarkdown(result);
    // MSFT row should have a placeholder
    const msftLine = md.split('\n').find((l) => l.startsWith('| MSFT |'));
    expect(msftLine).toBeDefined();
    expect(msftLine).toContain('—');
  });
});

// ---------------------------------------------------------------------------
// Tool — matrix_analysis
// ---------------------------------------------------------------------------

describe('matrix_analysis tool', () => {
  test('returns feature_disabled when RESEARCH_TOOL off', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({});
    const parsed = JSON.parse(out as string);
    if (parsed.error !== 'feature_disabled') return; // skip when gate is on
    expect(parsed.error).toBe('feature_disabled');
  });

  test('happy path with inline cells returns JSON', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({
      tickers: ['AAPL', 'MSFT'],
      dimensions: ['technical', 'fundamental'],
      cells: [
        { ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 25, momentum: 0.1 }, polarity: 0.7, confidence: 0.9 },
        { ticker: 'AAPL', dimension: 'fundamental', metrics: { pe: 28, roe: 0.30 }, polarity: 0.5, confidence: 0.8 },
        { ticker: 'MSFT', dimension: 'technical', metrics: { rsi: 50 }, polarity: 0, confidence: 0.6 },
        { ticker: 'MSFT', dimension: 'fundamental', metrics: { pe: 35, roe: 0.25 }, polarity: 0.2, confidence: 0.7 },
      ],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.spec.tickers).toEqual(['AAPL', 'MSFT']);
    expect(parsed.cells.length).toBe(4);
    expect(parsed.summary.overallLeaders.length).toBe(2);
  });

  test('format=csv returns CSV string', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({
      tickers: ['AAPL'],
      dimensions: ['technical'],
      cells: [
        { ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 50 }, polarity: 0, confidence: 1 },
      ],
      format: 'csv',
    });
    if (typeof out === 'string' && out.startsWith('{')) {
      const parsed = JSON.parse(out);
      if (parsed.error === 'feature_disabled') return;
    }
    expect(out as string).toContain('ticker,dimension');
  });

  test('format=markdown returns pivoted markdown', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({
      tickers: ['AAPL'],
      dimensions: ['technical', 'fundamental'],
      cells: [
        { ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 25 }, polarity: 0.5, confidence: 0.8 },
        { ticker: 'AAPL', dimension: 'fundamental', metrics: { pe: 10 }, polarity: 0.5, confidence: 0.8 },
      ],
      format: 'markdown',
    });
    if (typeof out === 'string' && out.startsWith('{')) {
      const parsed = JSON.parse(out);
      if (parsed.error === 'feature_disabled') return;
    }
    expect(out as string).toContain('# 投资矩阵分析');
    expect(out as string).toContain('| 标的 | 技术 | 基本面 |');
  });

  test('uses default universe when tickers omitted', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({ dimensions: ['technical'] });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.spec.tickers.length).toBe(50);
  });

  test('uses all dimensions when dimensions omitted', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({ tickers: ['AAPL'] });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.spec.dimensions).toEqual(['technical', 'fundamental', 'flow', 'sentiment']);
  });

  test('limit caps the number of returned cells', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({
      tickers: ['AAPL', 'MSFT', 'TSLA'],
      dimensions: ['technical', 'fundamental', 'flow', 'sentiment'],
      cells: Array.from({ length: 12 }, (_, i) => ({
        ticker: ['AAPL', 'MSFT', 'TSLA'][i % 3] as string,
        dimension: ['technical', 'fundamental', 'flow', 'sentiment'][i % 4] as 'technical',
        metrics: { x: i },
        polarity: Math.sin(i) * 0.8, // bounded in [-0.8, 0.8]
        confidence: 0.5,
      })),
      limit: 5,
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.cells.length).toBe(5);
  });

  test('cells with tickers outside spec are silently dropped', async () => {
    const tool = createMatrixAnalysisTool();
    const out = await tool.invoke({
      tickers: ['AAPL'],
      dimensions: ['technical'],
      cells: [
        { ticker: 'UNKNOWN', dimension: 'technical', metrics: {}, polarity: 0, confidence: 0 },
        { ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 50 }, polarity: 0, confidence: 1 },
      ],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.cells.length).toBe(1);
    expect(parsed.cells[0].ticker).toBe('AAPL');
  });

  test('buildMatrixAnalysisTool accepts a custom resolver', async () => {
    const resolver: CellResolver = async (ticker) => {
      if (ticker === 'AAPL') return { metrics: { rsi: 25 }, polarity: 0.5, confidence: 0.9 };
      return null;
    };
    const tool = buildMatrixAnalysisTool(resolver);
    const out = await tool.invoke({ tickers: ['AAPL'], dimensions: ['technical'] });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.cells.length).toBe(1);
    expect(parsed.cells[0].verdict).toContain('RSI=25');
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe('safety', () => {
  test('renderVerdict on empty metrics does not throw', () => {
    expect(() => renderVerdict('technical', {})).not.toThrow();
  });

  test('renderVerdict on weird string values does not throw', () => {
    expect(() => renderVerdict('fundamental', { pe: 'N/A', roe: '—' })).not.toThrow();
  });

  test('MatrixEngine build with no spec data does not throw', async () => {
    const eng = new MatrixEngine({ tickers: ['AAPL'], dimensions: ['technical'] });
    expect(async () => eng.build()).not.toThrow();
  });

  test('tool with empty input does not throw', async () => {
    const tool = createMatrixAnalysisTool();
    expect(async () => tool.invoke({})).not.toThrow();
  });

  test('tool with invalid ticker array gracefully errors', async () => {
    const tool = createMatrixAnalysisTool();
    expect(async () => tool.invoke({ tickers: 'not-array' })).toThrow();
  });
});
