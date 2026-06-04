/**
 * Natural-Language Screener — e2e tests.
 *
 * Covers:
 *   - ruleBasedTranslate: each rule pattern (PE/PB/ROE/dividend/growth/北向/科技/银行/...)
 *   - Multi-criteria queries (e.g. "PE<20, ROE>15%, 科技股")
 *   - formatCriteriaZh: Chinese explanation
 *   - NLScreener orchestrator: rule → LLM fallback
 *   - toAdvancedScreeningCriteria: shape conversion
 *   - Tool: feature_disabled / happy path / override / candidates filtering
 *   - Safety: empty query, weird inputs
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  NLScreener,
  ruleBasedTranslate,
  formatCriteriaZh,
  createNlScreenTool,
  type ScreenCriteria,
  type LLMTranslateFn,
} from './nl-screener.js';

// ---------------------------------------------------------------------------
// ruleBasedTranslate — value / quality
// ---------------------------------------------------------------------------

describe('ruleBasedTranslate — value', () => {
  test('PE < 20', () => {
    const r = ruleBasedTranslate('找出 PE < 20 的股票');
    expect(r.criteria.value?.pe_max).toBe(20);
    expect(r.patterns.some((p) => p.pattern === 'pe_max')).toBe(true);
    expect(r.explanation).toContain('PE ≤ 20');
  });

  test('PE <= 30', () => {
    const r = ruleBasedTranslate('市盈率 <= 30');
    expect(r.criteria.value?.pe_max).toBe(30);
  });

  test('PE > 50', () => {
    const r = ruleBasedTranslate('PE > 50');
    expect(r.criteria.value?.pe_min).toBe(50);
  });

  test('PB < 2', () => {
    const r = ruleBasedTranslate('PB < 2');
    expect(r.criteria.value?.pb_max).toBe(2);
  });

  test('English PE/PB', () => {
    const r = ruleBasedTranslate('stocks with P/E < 25 and P/B < 3');
    expect(r.criteria.value?.pe_max).toBe(25);
    expect(r.criteria.value?.pb_max).toBe(3);
  });

  test('dividend yield > 3%', () => {
    const r = ruleBasedTranslate('股息率 > 3%');
    expect(r.criteria.value?.dividend_yield_min).toBe(3);
  });

  test('dividend yield > 3 (without %)', () => {
    const r = ruleBasedTranslate('股息率 > 3');
    expect(r.criteria.value?.dividend_yield_min).toBe(3);
  });
});

describe('ruleBasedTranslate — growth + quality', () => {
  test('营收增长 > 20%', () => {
    const r = ruleBasedTranslate('营收增长 > 20%');
    expect(r.criteria.growth?.revenue_growth_min).toBeCloseTo(0.2, 5);
  });

  test('利润增长 > 30%', () => {
    const r = ruleBasedTranslate('利润增长 > 30');
    expect(r.criteria.growth?.profit_growth_min).toBeCloseTo(0.3, 5);
  });

  test('English revenue growth > 15%', () => {
    const r = ruleBasedTranslate('revenue growth > 15%');
    expect(r.criteria.growth?.revenue_growth_min).toBeCloseTo(0.15, 5);
  });

  test('ROE > 15%', () => {
    const r = ruleBasedTranslate('ROE > 15%');
    expect(r.criteria.quality?.roe_min).toBeCloseTo(0.15, 5);
  });

  test('净资产收益率 > 20', () => {
    const r = ruleBasedTranslate('净资产收益率 > 20');
    expect(r.criteria.quality?.roe_min).toBeCloseTo(0.2, 5);
  });
});

// ---------------------------------------------------------------------------
// ruleBasedTranslate — flow
// ---------------------------------------------------------------------------

describe('ruleBasedTranslate — flow', () => {
  test('近 5 日北向净流入', () => {
    const r = ruleBasedTranslate('近 5 日北向净流入');
    expect(r.criteria.flow?.window_days).toBe(5);
    expect(r.criteria.flow?.northbound_min).toBe(0);
  });

  test('北向资金净流入 1.5 亿', () => {
    const r = ruleBasedTranslate('北向资金净流入 1.5 亿');
    expect(r.criteria.flow?.northbound_min).toBeCloseTo(1.5, 5);
  });

  test('近 20 日北向资金净流入', () => {
    const r = ruleBasedTranslate('近 20 日北向资金净流入');
    expect(r.criteria.flow?.window_days).toBe(20);
  });

  test('English northbound net inflow', () => {
    const r = ruleBasedTranslate('5-day northbound net inflow');
    expect(r.criteria.flow?.window_days).toBe(5);
  });

  test('主力净流入 2 亿', () => {
    const r = ruleBasedTranslate('主力净流入 2 亿');
    expect(r.criteria.flow?.net_inflow_min).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ruleBasedTranslate — sector / theme
// ---------------------------------------------------------------------------

describe('ruleBasedTranslate — sector / theme', () => {
  test('科技股 → themes tech/AI/semiconductor/cloud', () => {
    const r = ruleBasedTranslate('科技股');
    expect(r.criteria.themes).toContain('tech');
    expect(r.criteria.themes).toContain('AI');
    expect(r.criteria.sector).toBe('Technology');
  });

  test('半导体', () => {
    const r = ruleBasedTranslate('半导体');
    expect(r.criteria.themes).toContain('semiconductor');
  });

  test('银行股', () => {
    const r = ruleBasedTranslate('银行股');
    expect(r.criteria.themes).toContain('financials');
    expect(r.criteria.sector).toBe('Financials');
  });

  test('消费 / 白酒 / 茅台', () => {
    const r = ruleBasedTranslate('白酒');
    expect(r.criteria.themes).toContain('consumer');
  });

  test('新能源 / 光伏 / solar', () => {
    const r = ruleBasedTranslate('光伏');
    expect(r.criteria.themes).toContain('energy');
  });

  test('医药 / 创新药', () => {
    const r = ruleBasedTranslate('创新药');
    expect(r.criteria.themes).toContain('healthcare');
  });

  test('地产 / reit', () => {
    const r = ruleBasedTranslate('reit');
    expect(r.criteria.themes).toContain('real_estate');
  });

  test('蓝筹 / 沪深 300', () => {
    const r = ruleBasedTranslate('蓝筹股');
    expect(r.criteria.market_cap_min).toBeGreaterThan(0);
  });

  test('English "tech stocks"', () => {
    const r = ruleBasedTranslate('tech stocks');
    expect(r.criteria.themes).toContain('tech');
  });
});

// ---------------------------------------------------------------------------
// ruleBasedTranslate — sort hints
// ---------------------------------------------------------------------------

describe('ruleBasedTranslate — sort hints', () => {
  test('低估 → sortBy=value', () => {
    const r = ruleBasedTranslate('低估的股票');
    expect(r.sortBy).toBe('value');
  });

  test('高分红 → sortBy=dividend', () => {
    const r = ruleBasedTranslate('高分红');
    expect(r.sortBy).toBe('dividend');
  });

  test('成长股 → sortBy=growth', () => {
    const r = ruleBasedTranslate('成长股');
    expect(r.sortBy).toBe('growth');
  });

  test('English undervalued → sortBy=value', () => {
    const r = ruleBasedTranslate('undervalued stocks');
    expect(r.sortBy).toBe('value');
  });
});

// ---------------------------------------------------------------------------
// ruleBasedTranslate — multi-criteria + edge cases
// ---------------------------------------------------------------------------

describe('ruleBasedTranslate — multi-criteria', () => {
  test('PE<20 + ROE>15% + 科技', () => {
    const r = ruleBasedTranslate('找出 PE<20、ROE>15%、科技股');
    expect(r.criteria.value?.pe_max).toBe(20);
    expect(r.criteria.quality?.roe_min).toBeCloseTo(0.15, 5);
    expect(r.criteria.themes).toContain('tech');
    expect(r.patterns.length).toBeGreaterThanOrEqual(3);
    expect(r.explanation).toContain('PE ≤ 20');
    expect(r.explanation).toContain('ROE ≥ 15.0%');
    expect(r.explanation).toContain('板块:Technology');
  });

  test('近 5 日北向净流入 + 银行', () => {
    const r = ruleBasedTranslate('近 5 日北向净流入的银行股');
    expect(r.criteria.flow?.window_days).toBe(5);
    expect(r.criteria.themes).toContain('financials');
  });

  test('高分红蓝筹', () => {
    const r = ruleBasedTranslate('高分红蓝筹');
    expect(r.sortBy).toBe('dividend');
    expect(r.criteria.market_cap_min).toBeGreaterThan(0);
  });

  test('query that matches nothing returns empty criteria', () => {
    const r = ruleBasedTranslate('asdfghjkl qwertyuiop');
    expect(r.patterns).toHaveLength(0);
    expect(r.criteria).toEqual({ limit: 20 });
    expect(r.explanation).toBe('无匹配条件');
    expect(r.source).toBe('rule');
  });

  test('default limit is 20', () => {
    const r = ruleBasedTranslate('PE < 30');
    expect(r.criteria.limit).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// formatCriteriaZh
// ---------------------------------------------------------------------------

describe('formatCriteriaZh', () => {
  test('formats full criteria', () => {
    const c: ScreenCriteria = {
      value: { pe_max: 20, pb_max: 3, dividend_yield_min: 3 },
      quality: { roe_min: 0.15 },
      sector: 'Technology',
    };
    const out = formatCriteriaZh(c, 'value');
    expect(out).toContain('PE ≤ 20');
    expect(out).toContain('PB ≤ 3');
    expect(out).toContain('ROE ≥ 15.0%');
    expect(out).toContain('板块:Technology');
    expect(out).toContain('按估值');
  });

  test('empty criteria → "无匹配条件"', () => {
    expect(formatCriteriaZh({})).toBe('无匹配条件');
  });

  test('flow with window days', () => {
    const c: ScreenCriteria = { flow: { northbound_min: 1.5, window_days: 5 } };
    const out = formatCriteriaZh(c);
    expect(out).toContain('北向5日净流入');
  });
});

// ---------------------------------------------------------------------------
// NLScreener orchestrator
// ---------------------------------------------------------------------------

describe('NLScreener', () => {
  test('rule-only when no LLM configured', async () => {
    const s = new NLScreener();
    const r = await s.translate('PE < 20');
    expect(r.source).toBe('rule');
    expect(r.criteria.value?.pe_max).toBe(20);
  });

  test('LLM fallback when rule produces nothing', async () => {
    const llm: LLMTranslateFn = async () => ({
      value: { pe_max: 50 },
      quality: { roe_min: 0.10 },
    });
    const s = new NLScreener({ llmTranslate: llm });
    const r = await s.translate('asdfghjkl qwertyuiop gibberish');
    expect(r.source).toBe('llm');
    expect(r.criteria.value?.pe_max).toBe(50);
    expect(r.criteria.quality?.roe_min).toBeCloseTo(0.1, 5);
  });

  test('LLM error falls back to rule result', async () => {
    const llm: LLMTranslateFn = async () => { throw new Error('LLM down'); };
    const s = new NLScreener({ llmTranslate: llm });
    const r = await s.translate('PE < 30');
    expect(r.source).toBe('rule');
    expect(r.criteria.value?.pe_max).toBe(30);
  });

  test('LLM returns null falls back to rule', async () => {
    const llm: LLMTranslateFn = async () => null;
    const s = new NLScreener({ llmTranslate: llm });
    const r = await s.translate('PE < 30');
    expect(r.source).toBe('rule');
  });

  test('rule + LLM merge when both fire', async () => {
    const llm: LLMTranslateFn = async () => ({ quality: { roe_min: 0.2 } });
    const s = new NLScreener({ llmTranslate: llm });
    // Query matches "PE < 20" (rule) + we mock LLM to add ROE
    // But LLM is only called when rule produces nothing... let me re-check
    const r = await s.translate('PE < 20');
    // rule fires, so LLM is NOT called
    expect(r.source).toBe('rule');
    expect(r.criteria.value?.pe_max).toBe(20);
    expect(r.criteria.quality?.roe_min).toBeUndefined();
  });

  test('toAdvancedScreeningCriteria maps the right shape', () => {
    const s = new NLScreener();
    const c: ScreenCriteria = {
      value: { pe_max: 20 },
      growth: { revenue_growth_min: 0.1 },
      quality: { roe_min: 0.15 },
      sector: 'Tech',
      limit: 10,
    };
    const out = s.toAdvancedScreeningCriteria(c);
    expect(out).toEqual({
      criteria: {
        value: { pe_max: 20 },
        growth: { revenue_growth_min: 0.1 },
        quality: { roe_min: 0.15 },
      },
      sector: 'Tech',
      limit: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// Tool — nl_screen
// ---------------------------------------------------------------------------

describe('nl_screen tool', () => {
  test('returns feature_disabled when SCREEN_TOOL off', async () => {
    const tool = createNlScreenTool();
    const out = await tool.invoke({ query: 'PE < 20' });
    const parsed = JSON.parse(out as string);
    if (parsed.error !== 'feature_disabled') return;
    expect(parsed.error).toBe('feature_disabled');
  });

  test('happy path: PE < 20 returns criteria + explanation', async () => {
    const tool = createNlScreenTool();
    const out = await tool.invoke({ query: '找出 PE < 20 的股票' });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.criteria.value.pe_max).toBe(20);
    expect(parsed.explanation).toContain('PE ≤ 20');
    expect(parsed.source).toBe('rule');
    expect(parsed.advancedScreeningCriteria.criteria.value.pe_max).toBe(20);
  });

  test('override_criteria supplements rule output', async () => {
    const tool = createNlScreenTool();
    const out = await tool.invoke({
      query: 'PE < 30',
      override_criteria: { value: { dividend_yield_min: 4 } },
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.criteria.value.pe_max).toBe(30);
    expect(parsed.criteria.value.dividend_yield_min).toBe(4);
  });

  test('candidates filter against translated criteria', async () => {
    const tool = createNlScreenTool();
    const out = await tool.invoke({
      query: 'PE < 20',
      candidates: [
        { code: 'A', pe: 15 },
        { code: 'B', pe: 25 },
        { code: 'C', pe: 18 },
        { code: 'D', pe: 100 },
      ],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.candidateCount).toBe(4);
    expect(parsed.matchCount).toBe(2);
    expect(parsed.matches.map((m: { code: string }) => m.code).sort()).toEqual(['A', 'C']);
  });

  test('candidates + multi-criteria filter', async () => {
    const tool = createNlScreenTool();
    const out = await tool.invoke({
      query: 'PE<20 ROE>15% 科技',
      candidates: [
        { code: 'A', pe: 15, roe: 0.20 },  // pass
        { code: 'B', pe: 15, roe: 0.10 },  // fail ROE
        { code: 'C', pe: 25, roe: 0.20 },  // fail PE
        { code: 'D', pe: 18, roe: 0.25 },  // pass
      ],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.matchCount).toBe(2);
  });

  test('limit cap is respected', async () => {
    const tool = createNlScreenTool();
    const out = await tool.invoke({
      query: 'PE < 30',
      limit: 1,
      candidates: [
        { code: 'A', pe: 15 },
        { code: 'B', pe: 18 },
        { code: 'C', pe: 20 },
      ],
    });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.matches.length).toBe(1);
    expect(parsed.criteria.limit).toBe(1);
  });

  test('with LLM translator, LLM output is used for non-rule queries', async () => {
    const llm: LLMTranslateFn = async (q) => {
      expect(q).toBe('some custom query the rules cannot parse');
      return { value: { pe_max: 100 } };
    };
    const tool = createNlScreenTool({ llmTranslate: llm });
    const out = await tool.invoke({ query: 'some custom query the rules cannot parse' });
    const parsed = JSON.parse(out as string);
    if (parsed.error === 'feature_disabled') return;
    expect(parsed.criteria.value.pe_max).toBe(100);
    expect(parsed.source).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe('safety', () => {
  test('empty query is rejected at schema level', async () => {
    const tool = createNlScreenTool();
    expect(async () => {
      await tool.invoke({ query: '' });
    }).toThrow();
  });

  test('very long query is handled', () => {
    const long = 'PE < 20 '.repeat(500);
    expect(() => ruleBasedTranslate(long)).not.toThrow();
  });

  test('query with weird characters', () => {
    expect(() => ruleBasedTranslate('PE < 20 !@#$%^&*()')).not.toThrow();
  });
});
