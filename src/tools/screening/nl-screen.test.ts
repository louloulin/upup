/**
 * nl_screen tests (P1.b.1 + P1.b.2)
 *
 * Coverage:
 *  - 8 typical NL queries (P1.b.2 list):
 *    1. AAPL-like
 *    2. 跌深 (deep pullback)
 *    3. RSI < 35
 *    4. ROE > 20%
 *    5. ex-金融 (exclude finance)
 *    6. 市值 $10B-$50B (market cap range)
 *    7. 复利型 (compound)
 *    8. 组合 (combination — multi-filter)
 *  - FilterSpec type validation (safeParseFilterSpec)
 *  - deterministicNlParser unit tests for each regex
 *  - executeFilterSpec unit tests for each operator
 *  - createNlScreenTool integration tests
 *  - validation rejects bad specs
 */

import { describe, expect, test } from 'bun:test';
import {
  deterministicNlParser,
  executeFilterSpec,
  createNlScreenTool,
  DEFAULT_UNIVERSE,
  type NlParserFn,
} from './nl-screen.js';
import { safeParseFilterSpec } from '../../plan/filter-spec.js';

// ---------------------------------------------------------------------------
// P1.b.2 — 8 typical NL queries
// ---------------------------------------------------------------------------

describe('P1.b.2 — 8 typical NL queries', () => {
  const tool = createNlScreenTool();

  async function run(q: string) {
    const out = await tool.invoke({ query: q, universe: 'us', limit: 50, realtime: false });
    return JSON.parse(out as string) as {
      source: string;
      query: string;
      template?: string;
      filterCount: number;
      matchedCount: number;
      results: Array<{ ticker: string; name: string; score: number; thesis: string; matchedCriteria: string[] }>;
    };
  }

  test('1. AAPL-like → returns large-cap tech with template flag', async () => {
    const r = await run('AAPL-like');
    expect(r.template).toBe('AAPL-like');
    expect(r.matchedCount).toBeGreaterThan(0);
    // AAPL must be in the results
    expect(r.results.some(x => x.ticker === 'AAPL')).toBe(true);
    // All results are tech sector (the universe only has tech, finance, etc. with the template adding tech preference)
    // Just check at least one is a large-cap tech
    expect(r.results.some(x => x.ticker === 'AAPL' || x.ticker === 'MSFT' || x.ticker === 'GOOG')).toBe(true);
  });

  test('2. 跌深 (deep pullback) → adds priceChange1y < -30 filter', async () => {
    const r = await run('跌深');
    expect(r.matchedCount).toBeGreaterThan(0);
    // PFE has priceChange1y = -35
    expect(r.results.some(x => x.ticker === 'PFE')).toBe(true);
  });

  test('3. RSI < 35 → returns oversold candidates', async () => {
    const r = await run('RSI < 35');
    // Only PFE has rsi=30 in the fixture
    expect(r.matchedCount).toBe(1);
    expect(r.results[0]!.ticker).toBe('PFE');
  });

  test('4. ROE > 20% → returns high-ROE stocks', async () => {
    const r = await run('ROE > 20%');
    // Universe: AAPL(150), MSFT(35), NVDA(90), COST(30), JNJ(22), META(30), GOOG(28) — exclude TSLA(20, not >), JPM(16)
    const tickers = r.results.map(x => x.ticker).sort();
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('MSFT');
    expect(tickers).toContain('NVDA');
    expect(tickers).not.toContain('JPM'); // roe 16, not > 20
  });

  test('5. ex-金融 → excludes finance sector', async () => {
    const r = await run('ex-金融');
    const tickers = r.results.map(x => x.ticker);
    expect(tickers).not.toContain('JPM');
    expect(tickers).not.toContain('BAC');
    expect(tickers).not.toContain('GS');
    expect(r.matchedCount).toBeGreaterThan(0);
  });

  test('6. 市值 $10B-$50B → mid-cap filter', async () => {
    const r = await run('市值 $10B-$50B');
    // Universe tickers with marketCap 10B-50B: GS(130B - no), BABA(200B - no)... let's see
    // Actually only those in [10B, 50B]: looking at the universe none fit. Adjust expectation:
    // GS = 130B, PFE = 160B, BABA = 200B, BAC = 280B — all > 50B
    // So no matches — this exercises the empty path
    expect(r.matchedCount).toBe(0);
    // But the filter was applied (between was extracted)
    expect(r.filterCount).toBeGreaterThan(0);
  });

  test('7. 复利型 → compound template + results include 复利型 thesis', async () => {
    const r = await run('复利型');
    expect(r.template).toBe('compound');
    expect(r.matchedCount).toBeGreaterThan(0);
    expect(r.results[0]!.thesis).toContain('复利型');
  });

  test('8. 组合 → ROE > 20% AND PE < 30 (multi-filter AND)', async () => {
    const r = await run('ROE > 20% AND PE < 30');
    // Both filters must be matched in matchedCriteria
    expect(r.filterCount).toBe(2);
    for (const result of r.results) {
      expect(result.matchedCriteria.length).toBe(2);
      expect(result.matchedCriteria.some(c => c.startsWith('roe'))).toBe(true);
      expect(result.matchedCriteria.some(c => c.startsWith('pe'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// deterministicNlParser unit tests
// ---------------------------------------------------------------------------

describe('deterministicNlParser', () => {
  test('PE < 15 → single pe filter', () => {
    const spec = deterministicNlParser('PE < 15', 'us');
    expect(spec.filters).toHaveLength(1);
    expect(spec.filters[0]).toEqual({ field: 'pe', op: '<', value: 15 });
  });

  test('PB <= 2 → single pb filter', () => {
    const spec = deterministicNlParser('PB <= 2', 'us');
    expect(spec.filters[0]).toEqual({ field: 'pb', op: '<=', value: 2 });
  });

  test('ROE > 20% → single roe filter, percent stripped', () => {
    const spec = deterministicNlParser('ROE > 20%', 'us');
    expect(spec.filters[0]).toEqual({ field: 'roe', op: '>', value: 20 });
  });

  test('市值 $10B-$50B → between filter (in USD)', () => {
    const spec = deterministicNlParser('市值 $10B-$50B', 'us');
    expect(spec.filters[0]!.field).toBe('marketCap');
    expect(spec.filters[0]!.op).toBe('between');
    expect(spec.filters[0]!.value).toEqual([10e9, 50e9]);
  });

  test('大市值 (no $) → default $10B threshold', () => {
    const spec = deterministicNlParser('大市值', 'us');
    expect(spec.filters[0]).toEqual({ field: 'marketCap', op: '>', value: 10e9 });
  });

  test('小市值 (no $) → default $2B threshold', () => {
    const spec = deterministicNlParser('小市值', 'us');
    expect(spec.filters[0]).toEqual({ field: 'marketCap', op: '<', value: 2e9 });
  });

  test('ex-金融 → sector != finance', () => {
    const spec = deterministicNlParser('ex-金融', 'us');
    expect(spec.filters[0]).toEqual({ field: 'sector', op: '!=', value: 'finance' });
  });

  test('momentum → template=momentum, no extra filters', () => {
    const spec = deterministicNlParser('momentum stocks', 'us');
    expect(spec.template).toBe('momentum');
    expect(spec.filters).toEqual([]);
  });

  test('AAPL-like → template=AAPL-like', () => {
    const spec = deterministicNlParser('AAPL-like names', 'us');
    expect(spec.template).toBe('AAPL-like');
  });

  test('combination: ROE > 20% AND PE < 30 → 2 filters', () => {
    const spec = deterministicNlParser('ROE > 20% AND PE < 30', 'us');
    expect(spec.filters).toHaveLength(2);
  });

  test('empty query → empty filters, no template', () => {
    const spec = deterministicNlParser('', 'us');
    expect(spec.filters).toEqual([]);
    expect(spec.template).toBeUndefined();
  });

  test('universe param flows through', () => {
    expect(deterministicNlParser('', 'us').universe).toBe('us');
    expect(deterministicNlParser('', 'cn').universe).toBe('cn');
    expect(deterministicNlParser('', 'hk').universe).toBe('hk');
    expect(deterministicNlParser('', 'crypto').universe).toBe('crypto');
  });
});

// ---------------------------------------------------------------------------
// executeFilterSpec unit tests (operator coverage)
// ---------------------------------------------------------------------------

describe('executeFilterSpec — operators', () => {
  function row(overrides: Partial<typeof DEFAULT_UNIVERSE[number]> = {}) {
    return { ...DEFAULT_UNIVERSE[0]!, ...overrides };
  }

  test('= operator exact match', () => {
    const r = executeFilterSpec({
      universe: 'us', filters: [{ field: 'pe', op: '=', value: 28 }], limit: 10, realtime: false,
    }, [row()]);
    expect(r).toHaveLength(1);
  });

  test('!= operator exclusion', () => {
    // filter: sector != tech → a row with sector=tech must be EXCLUDED
    const r = executeFilterSpec({
      universe: 'us', filters: [{ field: 'sector', op: '!=', value: 'tech' }], limit: 10, realtime: false,
    }, [row({ sector: 'tech' }), row({ sector: 'finance' })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.sector).toBe('finance');
  });

  test('> operator', () => {
    const r = executeFilterSpec({
      universe: 'us', filters: [{ field: 'roe', op: '>', value: 100 }], limit: 10, realtime: false,
    }, [row({ roe: 150 })]);
    expect(r).toHaveLength(1);
  });

  test('between operator inclusive bounds', () => {
    const r = executeFilterSpec({
      universe: 'us', filters: [{ field: 'pe', op: 'between', value: [20, 30] }], limit: 10, realtime: false,
    }, [row({ pe: 20 }), row({ pe: 25 }), row({ pe: 30 }), row({ pe: 31 })]);
    expect(r.map(x => x.metrics.pe)).toEqual([20, 25, 30]);
  });

  test('in operator', () => {
    const r = executeFilterSpec({
      universe: 'us', filters: [{ field: 'pe', op: 'in', value: [10, 20, 28] }], limit: 10, realtime: false,
    }, [row({ pe: 10 }), row({ pe: 20 }), row({ pe: 30 })]);
    expect(r).toHaveLength(2);
  });

  test('AND semantics: one filter fails → row excluded', () => {
    const r = executeFilterSpec({
      universe: 'us',
      filters: [
        { field: 'roe', op: '>', value: 20 },
        { field: 'pe', op: '<', value: 30 },
      ],
      limit: 10, realtime: false,
    }, [row({ roe: 25, pe: 50 })]); // roe passes, pe fails
    expect(r).toHaveLength(0);
  });

  test('limit truncates results', () => {
    const r = executeFilterSpec({
      universe: 'us', filters: [], limit: 3, realtime: false,
    }, DEFAULT_UNIVERSE);
    expect(r).toHaveLength(3);
  });

  test('realtime=false drops rows missing rsi', () => {
    const r = executeFilterSpec({
      universe: 'us', filters: [], limit: 100, realtime: false,
    }, [row({ rsi: undefined })]);
    expect(r).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FilterSpec validation
// ---------------------------------------------------------------------------

describe('safeParseFilterSpec', () => {
  test('valid spec parses', () => {
    const v = safeParseFilterSpec({
      universe: 'us',
      filters: [{ field: 'pe', op: '<', value: 20 }],
      limit: 50,
      realtime: false,
    });
    expect(v.ok).toBe(true);
  });

  test('invalid op is rejected', () => {
    const v = safeParseFilterSpec({
      universe: 'us',
      filters: [{ field: 'pe', op: 'BOGUS', value: 20 }],
      limit: 50,
      realtime: false,
    });
    expect(v.ok).toBe(false);
  });

  test('missing universe is rejected', () => {
    const v = safeParseFilterSpec({
      filters: [],
      limit: 50,
      realtime: false,
    });
    expect(v.ok).toBe(false);
  });

  test('invalid universe is rejected', () => {
    const v = safeParseFilterSpec({
      universe: 'jp',
      filters: [],
      limit: 50,
      realtime: false,
    });
    expect(v.ok).toBe(false);
  });

  test('limit out of range is rejected', () => {
    const v = safeParseFilterSpec({
      universe: 'us', filters: [], limit: 1000, realtime: false,
    });
    expect(v.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createNlScreenTool integration
// ---------------------------------------------------------------------------

describe('createNlScreenTool', () => {
  test('returns JSON with all required fields', async () => {
    const tool = createNlScreenTool();
    const out = JSON.parse(await tool.invoke({ query: 'AAPL-like', universe: 'us', limit: 5, realtime: false }) as string);
    expect(out.source).toBe('nl_screen');
    expect(out.query).toBe('AAPL-like');
    expect(out.universe).toBe('us');
    expect(out.scannedCount).toBe(DEFAULT_UNIVERSE.length);
    expect(Array.isArray(out.results)).toBe(true);
  });

  test('realtime=true keeps rows missing rsi', async () => {
    const stubParser: NlParserFn = (_q, universe) => ({
      universe, filters: [], sortBy: { field: 'score', dir: 'desc' }, limit: 50, realtime: true,
    });
    const tool = createNlScreenTool({ parser: stubParser });
    const out = JSON.parse(await tool.invoke({ query: 'all', universe: 'us', limit: 100, realtime: true }) as string);
    expect(out.matchedCount).toBe(DEFAULT_UNIVERSE.length);
  });

  test('custom universe flows through', async () => {
    const tiny = [{
      ticker: 'TINY', name: 'Tiny Co.', sector: 'tech', marketCap: 1e9, pe: 10, pb: 1,
      roe: 5, revenueGrowth: 1, profitGrowth: 1, rsi: 50,
    }];
    const tool = createNlScreenTool({ universe: tiny });
    const out = JSON.parse(await tool.invoke({ query: 'tech', universe: 'us', limit: 50, realtime: false }) as string);
    expect(out.scannedCount).toBe(1);
    expect(out.results[0]!.ticker).toBe('TINY');
  });

  test('validateSpec=false: bad parser output still runs (no validation error)', async () => {
    // The parser is trusted if validateSpec=false
    const permissiveParser: NlParserFn = (_q, universe) => ({
      universe, filters: [{ field: 'sector', op: '=', value: 'tech' }], limit: 50, realtime: false,
    });
    const tool = createNlScreenTool({ parser: permissiveParser, validateSpec: false });
    const out = JSON.parse(await tool.invoke({ query: 'whatever', universe: 'us', limit: 50, realtime: false }) as string);
    expect(out.results.length).toBeGreaterThan(0);
  });
});
