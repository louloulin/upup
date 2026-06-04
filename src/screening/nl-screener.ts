/**
 * Natural-Language Stock Screener — FinChat-style.
 *
 * Public surface:
 *   - `NLScreener`           : orchestrator (rule-based + optional LLM fallback)
 *   - `ruleBasedTranslate`   : pure regex-driven translation (offline, deterministic)
 *   - `ScreenCriteria`       : criteria shape compatible with the existing
 *                              `src/tools/screening` advanced_screening engine
 *   - `formatCriteriaZh`     : human-readable Chinese explanation
 *   - `createNlScreenTool`   : LangChain tool factory
 *
 * Design:
 *   - **Rule-based first**: a curated set of CN+EN regex patterns extract
 *     PE/ROE/北向/科技/银行/... into the ScreenCriteria. This works offline
 *     and is fully testable.
 *   - **LLM second**: callers can pass an `llmTranslate` function (e.g.
 *     backed by gpt-4) for queries the rule engine cannot parse. The
 *     LLM output is validated against the ScreenCriteria schema before use.
 *   - **No live data fetch**: the tool returns the translated criteria +
 *     explanation. The actual stock filtering is delegated to
 *     `advanced_screening` / `screen_stocks` (which need real data sources).
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { isFeatureCompiledIn } from '../agent/feature-gates.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValueCriteria {
  pe_max?: number;
  pe_min?: number;
  pb_max?: number;
  pb_min?: number;
  ps_max?: number;
  dividend_yield_min?: number;
}

export interface GrowthCriteria {
  revenue_growth_min?: number;
  profit_growth_min?: number;
}

export interface QualityCriteria {
  roe_min?: number;
  roa_min?: number;
  gross_margin_min?: number;
  net_margin_min?: number;
}

export interface TechnicalCriteria {
  rsi_max?: number;
  rsi_min?: number;
  /** Price above moving average. */
  above_ma?: 'ma20' | 'ma60' | 'ma250';
  momentum_min?: number;
}

export interface FlowCriteria {
  /** Northbound net inflow in 亿 (positive = net buy). */
  northbound_min?: number;
  /** Main-board net inflow in 亿. */
  net_inflow_min?: number;
  /** Time window in trading days. */
  window_days?: number;
}

export interface ScreenCriteria {
  value?: ValueCriteria;
  growth?: GrowthCriteria;
  quality?: QualityCriteria;
  technical?: TechnicalCriteria;
  flow?: FlowCriteria;
  market_cap_min?: number;
  market_cap_max?: number;
  sector?: string;
  themes?: string[];
  limit?: number;
}

export interface PatternMatch {
  /** Regex/keyword identifier. */
  pattern: string;
  /** The substring that matched. */
  matched: string;
  /** The extracted value (if numeric). */
  value?: number | string;
}

export interface NLScreenResult {
  criteria: ScreenCriteria;
  /** Plain-Chinese summary of the translated criteria. */
  explanation: string;
  /** Suggested sort/rank order. */
  sortBy?: 'value' | 'growth' | 'quality' | 'dividend' | 'momentum';
  /** Which patterns matched (for debugging + audit). */
  patterns: PatternMatch[];
  /** Whether the translation came from rule-based (deterministic) or LLM. */
  source: 'rule' | 'llm' | 'mixed';
}

// ---------------------------------------------------------------------------
// Rule patterns — ordered roughly from most-specific to most-generic.
// Each pattern is a function that tries to match the query and, if successful,
// returns a partial ScreenCriteria + a PatternMatch trace entry.
// ---------------------------------------------------------------------------

type Rule = {
  id: string;
  /** Test if this rule applies to the query. */
  test: (q: string) => boolean;
  /** Apply the rule to extract a partial criteria. */
  apply: (q: string) => { partial: ScreenCriteria; match: PatternMatch };
  /** Sector/theme hint, if any. */
  sectorHint?: string;
};

const RULES: Rule[] = [
  // ---- Value / PE ----------------------------------------------------------
  {
    id: 'pe_max',
    test: (q) => /(?:PE|市盈率|P\/E)[^0-9]{0,5}[<≤]=?\s*(\d+(?:\.\d+)?)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:PE|市盈率|P\/E)[^0-9]{0,5}[<≤]=?\s*(\d+(?:\.\d+)?)/i)!;
      return {
        partial: { value: { pe_max: parseFloat(m[1]) } },
        match: { pattern: 'pe_max', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },
  {
    id: 'pe_min',
    test: (q) => /(?:PE|市盈率|P\/E)[^0-9]{0,5}[>≥]=?\s*(\d+(?:\.\d+)?)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:PE|市盈率|P\/E)[^0-9]{0,5}[>≥]=?\s*(\d+(?:\.\d+)?)/i)!;
      return {
        partial: { value: { pe_min: parseFloat(m[1]) } },
        match: { pattern: 'pe_min', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },
  {
    id: 'pb_max',
    test: (q) => /(?:PB|市净率|P\/B)[^0-9]{0,5}[<≤]=?\s*(\d+(?:\.\d+)?)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:PB|市净率|P\/B)[^0-9]{0,5}[<≤]=?\s*(\d+(?:\.\d+)?)/i)!;
      return {
        partial: { value: { pb_max: parseFloat(m[1]) } },
        match: { pattern: 'pb_max', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },
  {
    id: 'dividend_yield_min',
    test: (q) => /(?:股息率|分红|dividend)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:股息率|分红|dividend)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i)!;
      return {
        partial: { value: { dividend_yield_min: parseFloat(m[1]) } },
        match: { pattern: 'dividend_yield_min', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },

  // ---- Growth --------------------------------------------------------------
  {
    id: 'revenue_growth_min',
    test: (q) => /(?:营收|revenue|sales)\s*(?:增长|growth|增速)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:营收|revenue|sales)\s*(?:增长|growth|增速)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i)!;
      return {
        partial: { growth: { revenue_growth_min: parseFloat(m[1]) / (parseFloat(m[1]) > 1 ? 100 : 1) } },
        match: { pattern: 'revenue_growth_min', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },
  {
    id: 'profit_growth_min',
    test: (q) => /(?:利润|净利|profit|earnings)\s*(?:增长|growth|增速)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:利润|净利|profit|earnings)\s*(?:增长|growth|增速)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i)!;
      return {
        partial: { growth: { profit_growth_min: parseFloat(m[1]) / (parseFloat(m[1]) > 1 ? 100 : 1) } },
        match: { pattern: 'profit_growth_min', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },

  // ---- Quality -------------------------------------------------------------
  {
    id: 'roe_min',
    test: (q) => /(?:ROE|净资产收益率)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:ROE|净资产收益率)[^0-9]{0,5}[>≥]\s*(\d+(?:\.\d+)?)\s*%?/i)!;
      return {
        partial: { quality: { roe_min: parseFloat(m[1]) / (parseFloat(m[1]) > 1 ? 100 : 1) } },
        match: { pattern: 'roe_min', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },

  // ---- Flow (北向资金) -----------------------------------------------------
  {
    id: 'northbound_inflow',
    test: (q) => /(?:北向|北向资金|northbound)[^0-9a-z]{0,15}(?:净流入|流入|净买入|net\s*inflow|net\s*buy)[^0-9]{0,5}(\d+(?:\.\d+)?)?/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:北向|北向资金|northbound)[^0-9a-z]{0,15}(?:净流入|流入|净买入|net\s*inflow|net\s*buy)[^0-9]{0,5}(\d+(?:\.\d+)?)?/i)!;
      // window: "近 5 日" / "近 20 日" / "5-day" / "20-day"
      const winM = q.match(/近\s*(\d+)\s*日|(\d+)\s*-?\s*day/i);
      const windowDays = winM ? parseInt(winM[1] || winM[2], 10) : 5;
      const amount = m[1] ? parseFloat(m[1]) : 0; // 0 = "any net inflow"
      return {
        partial: { flow: { northbound_min: amount, window_days: windowDays } },
        match: { pattern: 'northbound_inflow', matched: m[0], value: `${amount}亿/${windowDays}日` },
      };
    },
  },
  {
    id: 'net_inflow',
    test: (q) => /(?:主力|净流入|net\s*inflow)[^0-9]{0,5}(\d+(?:\.\d+)?)\s*亿?/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:主力|净流入|net\s*inflow)[^0-9]{0,5}(\d+(?:\.\d+)?)\s*亿?/i)!;
      return {
        partial: { flow: { net_inflow_min: parseFloat(m[1]) } },
        match: { pattern: 'net_inflow', matched: m[0], value: parseFloat(m[1]) },
      };
    },
  },

  // ---- Sectors / themes ----------------------------------------------------
  {
    id: 'sector_tech',
    test: (q) => /(?:科技|tech|technology|半导体|芯片|software|saas|云|cloud|ai|人工智能)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:科技|tech|technology|半导体|芯片|software|saas|云|cloud|ai|人工智能)/i)!;
      return {
        partial: { themes: ['tech', 'AI', 'semiconductor', 'cloud'] },
        match: { pattern: 'sector_tech', matched: m[0] },
        sectorHint: 'Technology',
      };
    },
  },
  {
    id: 'sector_bank',
    test: (q) => /(?:银行|bank|金融|insurance|保险|券商|证券)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:银行|bank|金融|insurance|保险|券商|证券)/i)!;
      return {
        partial: { themes: ['financials'] },
        match: { pattern: 'sector_bank', matched: m[0] },
        sectorHint: 'Financials',
      };
    },
  },
  {
    id: 'sector_consumer',
    test: (q) => /(?:消费|consumer|白酒|食品|餐饮|retail|餐饮|茅台)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:消费|consumer|白酒|食品|餐饮|retail|茅台)/i)!;
      return {
        partial: { themes: ['consumer'] },
        match: { pattern: 'sector_consumer', matched: m[0] },
        sectorHint: 'Consumer',
      };
    },
  },
  {
    id: 'sector_energy',
    test: (q) => /(?:能源|energy|石油|oil|gas|天然气|煤炭|新能源|renewable|光伏|solar)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:能源|energy|石油|oil|gas|天然气|煤炭|新能源|renewable|光伏|solar)/i)!;
      return {
        partial: { themes: ['energy'] },
        match: { pattern: 'sector_energy', matched: m[0] },
        sectorHint: 'Energy',
      };
    },
  },
  {
    id: 'sector_healthcare',
    test: (q) => /(?:医药|healthcare|pharma|生物|biotech|医院|medical|创新药)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:医药|healthcare|pharma|生物|biotech|医院|medical|创新药)/i)!;
      return {
        partial: { themes: ['healthcare'] },
        match: { pattern: 'sector_healthcare', matched: m[0] },
        sectorHint: 'Healthcare',
      };
    },
  },
  {
    id: 'sector_reit',
    test: (q) => /(?:地产|real\s*estate|reit|物业|房地产)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:地产|real\s*estate|reit|物业|房地产)/i)!;
      return {
        partial: { themes: ['real_estate'] },
        match: { pattern: 'sector_reit', matched: m[0] },
        sectorHint: 'Real Estate',
      };
    },
  },
  {
    id: 'sector_blue_chip',
    test: (q) => /(?:蓝筹|blue\s*chip|大盘|large\s*cap|沪深\s*300|hs\s*300|中证\s*100)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:蓝筹|blue\s*chip|大盘|large\s*cap|沪深\s*300|hs\s*300|中证\s*100)/i)!;
      return {
        partial: { market_cap_min: 100 }, // 100 亿+
        match: { pattern: 'sector_blue_chip', matched: m[0] },
      };
    },
  },

  // ---- Sort hints ----------------------------------------------------------
  {
    id: 'sort_value',
    test: (q) => /(?:低估|undervalued|cheap|价值|value\s*stock)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:低估|undervalued|cheap|价值|value\s*stock)/i)!;
      return {
        partial: {},
        match: { pattern: 'sort_value', matched: m[0], value: 'value' },
      };
    },
  },
  {
    id: 'sort_dividend',
    test: (q) => /(?:高分红|高股息|股息|high\s*dividend|dividend\s*stock)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:高分红|高股息|股息|high\s*dividend|dividend\s*stock)/i)!;
      return {
        partial: {},
        match: { pattern: 'sort_dividend', matched: m[0], value: 'dividend' },
      };
    },
  },
  {
    id: 'sort_growth',
    test: (q) => /(?:成长|高增长|高速增长|growth\s*stock|aggressive\s*growth)/i.test(q),
    apply: (q) => {
      const m = q.match(/(?:成长|高增长|高速增长|growth\s*stock|aggressive\s*growth)/i)!;
      return {
        partial: {},
        match: { pattern: 'sort_growth', matched: m[0], value: 'growth' },
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Rule-based translator
// ---------------------------------------------------------------------------

/**
 * Pure rule-based translation. No LLM, no I/O. Returns the merged criteria
 * + an explanation string + a trace of which patterns matched.
 */
export function ruleBasedTranslate(query: string): NLScreenResult {
  const criteria: ScreenCriteria = {};
  const patterns: PatternMatch[] = [];
  let sectorHint: string | undefined;
  let sortBy: NLScreenResult['sortBy'];

  for (const rule of RULES) {
    if (!rule.test(query)) continue;
    const result = rule.apply(query) as { partial: ScreenCriteria; match: PatternMatch; sectorHint?: string };
    const { partial, match, sectorHint: returnedHint } = result;
    // Deep-merge partial into criteria
    for (const k of Object.keys(partial) as Array<keyof ScreenCriteria>) {
      const v = partial[k];
      if (v === undefined) continue;
      if (typeof v === 'object' && !Array.isArray(v)) {
        // Group object (value/growth/quality/technical/flow)
        const target = (criteria[k] as Record<string, unknown>) ?? {};
        Object.assign(target, v);
        (criteria as Record<string, unknown>)[k] = target;
      } else if (Array.isArray(v)) {
        // themes array
        const target = (criteria.themes ?? []) as string[];
        for (const t of v) if (!target.includes(t)) target.push(t);
        criteria.themes = target;
      } else {
        (criteria as Record<string, unknown>)[k] = v;
      }
    }
    patterns.push(match);
    const effectiveHint = rule.sectorHint ?? returnedHint;
    if (effectiveHint && !sectorHint) sectorHint = effectiveHint;
    if (rule.id === 'sort_value') sortBy = 'value';
    if (rule.id === 'sort_dividend') sortBy = 'dividend';
    if (rule.id === 'sort_growth') sortBy = 'growth';
  }
  if (sectorHint && !criteria.sector) criteria.sector = sectorHint;
  if (!criteria.limit) criteria.limit = 20;
  return {
    criteria,
    explanation: formatCriteriaZh(criteria, sortBy),
    sortBy,
    patterns,
    source: 'rule',
  };
}

// ---------------------------------------------------------------------------
// Explanation formatter
// ---------------------------------------------------------------------------

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function num(v: number, digits = 1): string {
  return v.toFixed(digits);
}

/** Format a ScreenCriteria as a short Chinese explanation. */
export function formatCriteriaZh(c: ScreenCriteria, sortBy?: NLScreenResult['sortBy']): string {
  const parts: string[] = [];
  if (c.value) {
    if (c.value.pe_max !== undefined) parts.push(`PE ≤ ${num(c.value.pe_max, 1)}`);
    if (c.value.pe_min !== undefined) parts.push(`PE ≥ ${num(c.value.pe_min, 1)}`);
    if (c.value.pb_max !== undefined) parts.push(`PB ≤ ${num(c.value.pb_max, 2)}`);
    if (c.value.pb_min !== undefined) parts.push(`PB ≥ ${num(c.value.pb_min, 2)}`);
    if (c.value.dividend_yield_min !== undefined) parts.push(`股息率 ≥ ${num(c.value.dividend_yield_min, 1)}%`);
  }
  if (c.growth) {
    if (c.growth.revenue_growth_min !== undefined) parts.push(`营收增长 ≥ ${pct(c.growth.revenue_growth_min)}`);
    if (c.growth.profit_growth_min !== undefined) parts.push(`利润增长 ≥ ${pct(c.growth.profit_growth_min)}`);
  }
  if (c.quality) {
    if (c.quality.roe_min !== undefined) parts.push(`ROE ≥ ${pct(c.quality.roe_min)}`);
    if (c.quality.gross_margin_min !== undefined) parts.push(`毛利率 ≥ ${pct(c.quality.gross_margin_min)}`);
  }
  if (c.flow) {
    if (c.flow.northbound_min !== undefined) {
      const win = c.flow.window_days ? `${c.flow.window_days}日` : '近期';
      parts.push(`北向${win}净流入 ≥ ${num(c.flow.northbound_min, 1)}亿`);
    }
    if (c.flow.net_inflow_min !== undefined) parts.push(`主力净流入 ≥ ${num(c.flow.net_inflow_min, 1)}亿`);
  }
  if (c.market_cap_min !== undefined) parts.push(`市值 ≥ ${c.market_cap_min}亿`);
  if (c.market_cap_max !== undefined) parts.push(`市值 ≤ ${c.market_cap_max}亿`);
  if (c.sector) parts.push(`板块:${c.sector}`);
  if (c.themes?.length) parts.push(`主题:${c.themes.join('/')}`);
  if (sortBy) {
    const sortZh: Record<NonNullable<NLScreenResult['sortBy']>, string> = {
      value: '按估值排序(低 PE/PB)',
      growth: '按增长排序(高营收/利润增速)',
      quality: '按质量排序(高 ROE)',
      dividend: '按股息排序(高分红)',
      momentum: '按动量排序',
    };
    parts.push(sortZh[sortBy]);
  }
  // Only include the limit if there are other parts; otherwise it's just noise
  const otherParts = parts.length;
  if (c.limit && otherParts > 0) parts.push(`最多 ${c.limit} 个结果`);
  return parts.length > 0 ? parts.join(', ') : '无匹配条件';
}

// ---------------------------------------------------------------------------
// NLScreener orchestrator
// ---------------------------------------------------------------------------

export type LLMTranslateFn = (query: string) => Promise<Partial<ScreenCriteria> | null>;

export class NLScreener {
  private llmTranslate?: LLMTranslateFn;

  constructor(opts: { llmTranslate?: LLMTranslateFn } = {}) {
    this.llmTranslate = opts.llmTranslate;
  }

  /**
   * Translate a natural-language query into ScreenCriteria.
   * First tries rule-based. If rule-based produced no patterns AND an
   * LLM translator is configured, falls back to LLM.
   */
  async translate(query: string): Promise<NLScreenResult> {
    const ruleResult = ruleBasedTranslate(query);
    if (ruleResult.patterns.length > 0) {
      return ruleResult;
    }
    if (!this.llmTranslate) {
      return ruleResult; // empty result, no LLM available
    }
    try {
      const llmPartial = await this.llmTranslate(query);
      if (!llmPartial) return ruleResult;
      // Merge LLM output with rule result
      const merged: ScreenCriteria = { ...ruleResult.criteria, ...llmPartial };
      if (llmPartial.value) merged.value = { ...(ruleResult.criteria.value ?? {}), ...llmPartial.value };
      if (llmPartial.growth) merged.growth = { ...(ruleResult.criteria.growth ?? {}), ...llmPartial.growth };
      if (llmPartial.quality) merged.quality = { ...(ruleResult.criteria.quality ?? {}), ...llmPartial.quality };
      if (llmPartial.flow) merged.flow = { ...(ruleResult.criteria.flow ?? {}), ...llmPartial.flow };
      if (llmPartial.themes) {
        const themes = new Set([...(ruleResult.criteria.themes ?? []), ...llmPartial.themes]);
        merged.themes = [...themes];
      }
      return {
        criteria: merged,
        explanation: formatCriteriaZh(merged),
        patterns: [...ruleResult.patterns, { pattern: 'llm_translate', matched: query, value: 'llm' }],
        source: 'llm',
      };
    } catch {
      return ruleResult;
    }
  }

  /** Convert criteria to the format expected by `advanced_screening` tool. */
  toAdvancedScreeningCriteria(c: ScreenCriteria): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (c.value || c.growth || c.quality) {
      out.criteria = {
        ...(c.value ? { value: c.value } : {}),
        ...(c.growth ? { growth: c.growth } : {}),
        ...(c.quality ? { quality: c.quality } : {}),
      };
    }
    if (c.sector) out.sector = c.sector;
    if (c.limit) out.limit = c.limit;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Tool — `nl_screen`
// ---------------------------------------------------------------------------

const NlScreenSchema = z.object({
  query: z.string().min(2).describe('Natural-language screening query in Chinese or English.'),
  limit: z.number().int().min(1).max(100).optional()
    .describe('Max results (default 20, max 100). Overrides query-derived limit.'),
  /** Optional inline criteria override (caller can pre-supply). */
  override_criteria: z.object({
    value: z.object({
      pe_max: z.number().optional(),
      pe_min: z.number().optional(),
      pb_max: z.number().optional(),
      pb_min: z.number().optional(),
      ps_max: z.number().optional(),
      dividend_yield_min: z.number().optional(),
    }).optional(),
    growth: z.object({
      revenue_growth_min: z.number().optional(),
      profit_growth_min: z.number().optional(),
    }).optional(),
    quality: z.object({
      roe_min: z.number().optional(),
      roa_min: z.number().optional(),
      gross_margin_min: z.number().optional(),
      net_margin_min: z.number().optional(),
    }).optional(),
  }).optional()
    .describe('Override or supplement the rule-based translation.'),
  /** Pre-fetched stock pool to filter against (the agent can pass this if it
   *  already has a list from `screen_stocks` or a sector list). */
  candidates: z.array(z.object({
    code: z.string(),
    name: z.string().optional(),
    pe: z.number().optional(),
    pb: z.number().optional(),
    roe: z.number().optional(),
    revenue_growth: z.number().optional(),
    profit_growth: z.number().optional(),
    sector: z.string().optional(),
    market_cap: z.number().optional(),
  })).optional()
    .describe('Optional stock pool to filter. If provided, the tool filters the pool using the translated criteria.'),
});

const NL_SCREEN_DESCRIPTION = `## nl_screen
FinChat-style natural-language stock screener.

**When to use**:
- The user asks in natural language for stocks matching some criteria: "找出 PE<20、ROE>15%、近 5 日北向净流入的科技股", "high dividend yield blue chips", "低估值高增长的消费股".
- The user is not sure which exact metrics to use — let the translator figure it out.
- The user wants a per-pattern trace (which rules matched, which values were extracted).

**Two-stage translation**:
1. **Rule-based first** (offline, deterministic): a curated set of CN+EN regex patterns extract PE / ROE / 北向 / 科技 / 银行 / etc.
2. **LLM second** (if configured): when the rule engine produces no matches, fall back to an LLM to translate.

**Input**:
- query: natural-language query (CN or EN, ≥2 chars)
- limit: cap result count
- override_criteria: optional pre-translated criteria (caller-supplied)
- candidates: optional stock pool — if provided, the tool filters it using the translated criteria and returns the matches

**Output**:
- criteria: structured ScreenCriteria (compatible with advanced_screening)
- explanation: short Chinese summary (e.g. "PE ≤ 20, ROE ≥ 15%, 板块:Technology, 主题:tech/AI")
- patterns: trace of which rules matched (audit / debug)
- source: 'rule' | 'llm' | 'mixed'
- if candidates provided: matched stocks with their metrics

**When NOT to use**:
- Pure data lookup (use screen_stocks / advanced_screening directly)
- Single ticker query (use financial_metrics)
- Realtime quote (use realtime_feed)
`;

function matchCandidate(c: NonNullable<z.infer<typeof NlScreenSchema>['candidates']>[number], crit: ScreenCriteria): boolean {
  if (crit.value?.pe_max !== undefined && c.pe !== undefined && c.pe > crit.value.pe_max) return false;
  if (crit.value?.pe_min !== undefined && c.pe !== undefined && c.pe < crit.value.pe_min) return false;
  if (crit.value?.pb_max !== undefined && c.pb !== undefined && c.pb > crit.value.pb_max) return false;
  if (crit.growth?.revenue_growth_min !== undefined && c.revenue_growth !== undefined && c.revenue_growth < crit.growth.revenue_growth_min) return false;
  if (crit.growth?.profit_growth_min !== undefined && c.profit_growth !== undefined && c.profit_growth < crit.growth.profit_growth_min) return false;
  if (crit.quality?.roe_min !== undefined && c.roe !== undefined && c.roe < crit.quality.roe_min) return false;
  if (crit.sector && c.sector && !c.sector.toLowerCase().includes(crit.sector.toLowerCase())) return false;
  return true;
}

export function createNlScreenTool(opts: { llmTranslate?: LLMTranslateFn } = {}): StructuredToolInterface {
  const screener = new NLScreener(opts);
  return new DynamicStructuredTool({
    name: 'nl_screen',
    description: NL_SCREEN_DESCRIPTION,
    schema: NlScreenSchema,
    func: async (input) => {
      if (!isFeatureCompiledIn('SCREEN_TOOL')) {
        return JSON.stringify({
          error: 'feature_disabled',
          message: 'nl_screen is gated by SCREEN_TOOL. Set BUN_CONFIG_FEATURE_SCREEN_TOOL=1 to enable.',
        });
      }
      try {
        const result = await screener.translate(input.query);
        // Apply overrides
        if (input.override_criteria) {
          if (input.override_criteria.value) {
            result.criteria.value = { ...(result.criteria.value ?? {}), ...input.override_criteria.value };
          }
          if (input.override_criteria.growth) {
            result.criteria.growth = { ...(result.criteria.growth ?? {}), ...input.override_criteria.growth };
          }
          if (input.override_criteria.quality) {
            result.criteria.quality = { ...(result.criteria.quality ?? {}), ...input.override_criteria.quality };
          }
        }
        if (input.limit !== undefined) result.criteria.limit = input.limit;
        const payload: Record<string, unknown> = {
          query: input.query,
          criteria: result.criteria,
          explanation: result.explanation,
          patterns: result.patterns,
          source: result.source,
          advancedScreeningCriteria: screener.toAdvancedScreeningCriteria(result.criteria),
        };
        if (input.candidates?.length) {
          const matches = input.candidates.filter((c) => matchCandidate(c, result.criteria));
          payload.matches = matches.slice(0, input.limit ?? result.criteria.limit ?? 20);
          payload.matchCount = matches.length;
          payload.candidateCount = input.candidates.length;
        }
        return JSON.stringify(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: 'translate_failed', message });
      }
    },
  });
}
