/**
 * nl_screen — Natural language stock screener (Gap G4 / P1.b)
 *
 * Two-stage pipeline (per design D-CTG-3):
 *   1. NL  → FilterSpec   (LLM-based or deterministic regex parser)
 *   2. FilterSpec → ranked rows + 1-line thesis (pure code)
 *
 * Default NL→FilterSpec parser is **deterministic** (regex/keyword based)
 * so the tool is hermetic and testable. Future change can swap in an
 * LLM-based parser behind the same `NlParserFn` interface.
 *
 * Default execution reads from a static universe fixture (also pluggable
 * via `NlScreenDeps.universe`); real backends can be wired in later.
 *
 * Reuse:
 *   - `src/plan/filter-spec.ts` — the typed schema (single source of truth)
 *   - `src/tools/valuation/decision-dashboard.ts` — thesis-style 1-liners
 *     (here we use a smaller template form; the dashboard is the heavy
 *     scorer for P2).
 *
 * Module boundary:
 *   nl-screen.ts (Layer 4) → plan/filter-spec.ts (Layer 2) + tools (Layer 3)
 *   No new dependencies, no network in the default path.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { StructuredToolInterface } from '@langchain/core/tools';
import {
  type FilterSpec,
  type FilterClause,
  type Universe,
  safeParseFilterSpec,
} from '../../plan/filter-spec.js';

// ---------------------------------------------------------------------------
// Universe row (the canonical shape the executor reads)
// ---------------------------------------------------------------------------

export interface StockRow {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;       // USD
  pe: number;              // TTM
  pb: number;
  roe: number;             // percent
  revenueGrowth: number;   // percent
  profitGrowth: number;    // percent
  rsi?: number;            // intraday; only present when realtime=true
  priceChange1y?: number;  // percent; for 跌深 / pullback detection
}

export interface ScreenResult {
  ticker: string;
  name: string;
  sector: string;
  score: number;
  matchedCriteria: string[];
  metrics: {
    marketCap: number;
    pe: number;
    pb: number;
    roe: number;
    revenueGrowth: number;
    rsi?: number;
  };
  thesis: string;
}

export interface NlScreenOutput {
  source: 'nl_screen';
  query: string;
  universe: Universe;
  template?: string;
  filterCount: number;
  scannedCount: number;
  matchedCount: number;
  results: ScreenResult[];
}

// ---------------------------------------------------------------------------
// NL → FilterSpec parser (injectable)
// ---------------------------------------------------------------------------

export type NlParserFn = (query: string, universe: Universe) => FilterSpec;

/**
 * Deterministic NL → FilterSpec parser. Handles the 8 typical cases
 * listed in P1.b.2. No LLM call — fully hermetic.
 */
export const deterministicNlParser: NlParserFn = (query, universe) => {
  const q = query.trim();
  const filters: FilterClause[] = [];
  let template: string | undefined;

  // --- templates (detected before numeric filters so 'AAPL-like' wins) ---
  if (/AAPL[-_ ]?like|类似\s*AAPL/i.test(q)) {
    template = 'AAPL-like';
  } else if (/momentum|动量/i.test(q)) {
    template = 'momentum';
  } else if (/复利|compound/i.test(q)) {
    template = 'compound';
  } else if (/\bvalue\b|价值/i.test(q) && !/growth/i.test(q)) {
    template = 'value';
  } else if (/\bgrowth\b|成长/i.test(q) && !/value/i.test(q)) {
    template = 'growth';
  }

  // --- numeric filters ---
  const pe = q.match(/\b(?:pe|p\/e|市盈率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i);
  if (pe) filters.push({ field: 'pe', op: pe[1] as FilterClause['op'], value: parseFloat(pe[2]!) });

  const pb = q.match(/\b(?:pb|p\/b|市净率)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i);
  if (pb) filters.push({ field: 'pb', op: pb[1] as FilterClause['op'], value: parseFloat(pb[2]!) });

  const roe = q.match(/\b(?:roe)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (roe) filters.push({ field: 'roe', op: roe[1] as FilterClause['op'], value: parseFloat(roe[2]!) });

  const rsi = q.match(/\b(?:rsi)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/i);
  if (rsi) filters.push({ field: 'rsi', op: rsi[1] as FilterClause['op'], value: parseFloat(rsi[2]!) });

  const revg = q.match(/\b(?:revenue[\s_-]*growth|营收增长)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (revg) filters.push({ field: 'revenueGrowth', op: revg[1] as FilterClause['op'], value: parseFloat(revg[2]!) });

  // --- market cap ranges ---
  const mcRange = q.match(/市值\s*\$?(\d+(?:\.\d+)?)B?\s*-\s*\$?(\d+(?:\.\d+)?)B/i);
  if (mcRange) {
    filters.push({
      field: 'marketCap',
      op: 'between',
      value: [parseFloat(mcRange[1]!) * 1e9, parseFloat(mcRange[2]!) * 1e9],
    });
  } else {
    const mcGt = q.match(/市值\s*>\s*\$?(\d+(?:\.\d+)?)\s*B|大市值|large[\s_-]*cap/i);
    if (mcGt) {
      const v = mcGt[1] ? parseFloat(mcGt[1]!) * 1e9 : 10e9;
      filters.push({ field: 'marketCap', op: '>', value: v });
    }
    const mcLt = q.match(/市值\s*<\s*\$?(\d+(?:\.\d+)?)\s*B|小市值|small[\s_-]*cap/i);
    if (mcLt) {
      const v = mcLt[1] ? parseFloat(mcLt[1]!) * 1e9 : 2e9;
      filters.push({ field: 'marketCap', op: '<', value: v });
    }
  }

  // --- pullback / 跌深 ---
  if (/跌深|deep[\s_-]*pullback|pullback/i.test(q)) {
    filters.push({ field: 'priceChange1y', op: '<', value: -30 });
  }

  // --- exclude finance ---
  if (/ex[-_ ]?金融|exclude\s*finance|非金融/i.test(q)) {
    filters.push({ field: 'sector', op: '!=', value: 'finance' });
  }

  return {
    universe,
    ...(template !== undefined && { template }),
    filters,
    sortBy: { field: 'score', dir: 'desc' },
    limit: 50,
    realtime: false,
  };
};

// ---------------------------------------------------------------------------
// Static universe fixture (15 hand-picked tickers across sectors / sizes)
// ---------------------------------------------------------------------------

export const DEFAULT_UNIVERSE: StockRow[] = [
  { ticker: 'AAPL', name: 'Apple Inc.',          sector: 'tech',         marketCap: 3_000e9, pe: 28, pb: 47, roe: 150, revenueGrowth: 6,  profitGrowth: 8,  rsi: 52, priceChange1y: 22 },
  { ticker: 'MSFT', name: 'Microsoft Corp.',     sector: 'tech',         marketCap: 2_800e9, pe: 35, pb: 12, roe: 35,  revenueGrowth: 12, profitGrowth: 15, rsi: 58, priceChange1y: 30 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.',        sector: 'tech',         marketCap: 2_200e9, pe: 60, pb: 50, roe: 90,  revenueGrowth: 100,profitGrowth: 200,rsi: 70, priceChange1y: 180 },
  { ticker: 'JPM',  name: 'JPMorgan Chase',      sector: 'finance',      marketCap: 550e9,  pe: 12, pb: 1.8,roe: 16,  revenueGrowth: 5,  profitGrowth: 12, rsi: 48, priceChange1y: 25 },
  { ticker: 'BAC',  name: 'Bank of America',     sector: 'finance',      marketCap: 280e9,  pe: 11, pb: 1.2,roe: 10,  revenueGrowth: 2,  profitGrowth: -3, rsi: 45, priceChange1y: 5 },
  { ticker: 'WMT',  name: 'Walmart',             sector: 'consumer',     marketCap: 420e9,  pe: 30, pb: 7,  roe: 19,  revenueGrowth: 5,  profitGrowth: 8,  rsi: 50, priceChange1y: 20 },
  { ticker: 'COST', name: 'Costco',              sector: 'consumer',     marketCap: 380e9,  pe: 50, pb: 17, roe: 30,  revenueGrowth: 7,  profitGrowth: 10, rsi: 55, priceChange1y: 35 },
  { ticker: 'PFE',  name: 'Pfizer',              sector: 'healthcare',   marketCap: 160e9,  pe: 14, pb: 1.8,roe: 12,  revenueGrowth: -3, profitGrowth: -20,rsi: 30, priceChange1y: -35 },
  { ticker: 'JNJ',  name: 'Johnson & Johnson',   sector: 'healthcare',   marketCap: 400e9,  pe: 22, pb: 5.5,roe: 22,  revenueGrowth: 3,  profitGrowth: 5,  rsi: 45, priceChange1y: 8 },
  { ticker: 'XOM',  name: 'Exxon Mobil',         sector: 'energy',       marketCap: 450e9,  pe: 13, pb: 2,  roe: 18,  revenueGrowth: 8,  profitGrowth: 15, rsi: 55, priceChange1y: 15 },
  { ticker: 'TSLA', name: 'Tesla',               sector: 'consumer',     marketCap: 700e9,  pe: 65, pb: 12, roe: 20,  revenueGrowth: 18, profitGrowth: -10,rsi: 38, priceChange1y: -25 },
  { ticker: 'META', name: 'Meta Platforms',      sector: 'tech',         marketCap: 1_300e9,pe: 25, pb: 8,  roe: 30,  revenueGrowth: 22, profitGrowth: 60, rsi: 62, priceChange1y: 80 },
  { ticker: 'GOOG', name: 'Alphabet',            sector: 'tech',         marketCap: 2_000e9,pe: 25, pb: 6.5,roe: 28,  revenueGrowth: 14, profitGrowth: 25, rsi: 55, priceChange1y: 40 },
  { ticker: 'BABA', name: 'Alibaba',             sector: 'tech',         marketCap: 200e9,  pe: 12, pb: 1.5,roe: 12,  revenueGrowth: 5,  profitGrowth: 8,  rsi: 42, priceChange1y: -10 },
  { ticker: 'GS',   name: 'Goldman Sachs',       sector: 'finance',      marketCap: 130e9,  pe: 13, pb: 1.4,roe: 11,  revenueGrowth: 4,  profitGrowth: 6,  rsi: 48, priceChange1y: 12 },
];

// ---------------------------------------------------------------------------
// FilterSpec → ScreenResult
// ---------------------------------------------------------------------------

function evaluateClause(row: StockRow, clause: FilterClause): boolean {
  const v = (row as unknown as Record<string, unknown>)[clause.field];
  if (v === undefined || v === null) return false;
  // String fields (sector, name, ticker) compare as strings; numeric fields
  // (pe, roe, marketCap, etc.) compare as numbers. NaN !== NaN means we
  // must NEVER use numeric comparison for string fields.
  const isString = typeof v === 'string' || typeof clause.value === 'string';
  if (isString) {
    const strV = String(v);
    const strVal = String(clause.value);
    switch (clause.op) {
      case '=':      return strV === strVal;
      case '!=':     return strV !== strVal;
      case 'in':     return Array.isArray(clause.value) && clause.value.some(x => String(x) === strV);
      case 'not-in': return Array.isArray(clause.value) && !clause.value.some(x => String(x) === strV);
      // Numeric ops on strings are not meaningful; fall through to false.
      default: return false;
    }
  }
  // Numeric path
  const numV = Number(v);
  const numClauseVal = Number(clause.value);
  switch (clause.op) {
    case '=':       return numV === numClauseVal;
    case '!=':      return numV !== numClauseVal;
    case '>':       return numV > numClauseVal;
    case '<':       return numV < numClauseVal;
    case '>=':      return numV >= numClauseVal;
    case '<=':      return numV <= numClauseVal;
    case 'between': {
      if (!Array.isArray(clause.value) || clause.value.length !== 2) return false;
      const lo = Number(clause.value[0]); const hi = Number(clause.value[1]);
      return numV >= lo && numV <= hi;
    }
    case 'in': {
      if (!Array.isArray(clause.value)) return false;
      return clause.value.some(x => Number(x) === numV);
    }
    case 'not-in': {
      if (!Array.isArray(clause.value)) return false;
      return !clause.value.some(x => Number(x) === numV);
    }
    default: return false;
  }
}

function scoreRow(row: StockRow, template: string | undefined, spec: FilterSpec): number {
  let s = 50;
  if (template === 'AAPL-like') {
    // large-cap tech leader, strong ROE
    if (row.sector === 'tech') s += 15;
    if (row.roe > 25) s += 10;
    if (row.marketCap > 1e12) s += 10;
  } else if (template === 'momentum') {
    if (row.rsi !== undefined && row.rsi > 50) s += 15;
    if (row.priceChange1y !== undefined && row.priceChange1y > 20) s += 15;
  } else if (template === 'value') {
    if (row.pe > 0 && row.pe < 20) s += 15;
    if (row.pb < 3) s += 10;
  } else if (template === 'growth') {
    if (row.revenueGrowth > 15) s += 15;
    if (row.profitGrowth > 20) s += 15;
  } else if (template === 'compound') {
    if (row.roe > 15) s += 10;
    if (row.revenueGrowth > 10) s += 10;
    if (row.profitGrowth > 10) s += 10;
  }
  // Reward matched-criteria density (capped at 20).
  s += Math.min(20, spec.filters.length * 5);
  return Math.round(Math.max(0, Math.min(100, s)));
}

function buildThesis(row: StockRow, template: string | undefined): string {
  const mcB = (row.marketCap / 1e9).toFixed(1);
  switch (template) {
    case 'AAPL-like':
      return `${row.name} — large-cap ${row.sector} leader, ROE ${row.roe.toFixed(1)}% (mcap $${mcB}B).`;
    case 'momentum':
      return `${row.name} — RSI ${row.rsi ?? '?'} with 1y price change ${row.priceChange1y ?? '?'}%.`;
    case 'value':
      return `${row.name} — PE ${row.pe.toFixed(1)} / PB ${row.pb.toFixed(1)} at ${row.roe.toFixed(1)}% ROE.`;
    case 'growth':
      return `${row.name} — revenue growth ${row.revenueGrowth.toFixed(1)}%, profit growth ${row.profitGrowth.toFixed(1)}%.`;
    case 'compound':
      return `${row.name} — 复利型: ROE ${row.roe.toFixed(1)}% + revenue ${row.revenueGrowth.toFixed(1)}% + profit ${row.profitGrowth.toFixed(1)}%.`;
    default:
      return `${row.name} (${row.ticker}) — ${row.sector} | mcap $${mcB}B, ROE ${row.roe.toFixed(1)}%, PE ${row.pe.toFixed(1)}.`;
  }
}

export function executeFilterSpec(
  spec: FilterSpec,
  universe: StockRow[] = DEFAULT_UNIVERSE,
): ScreenResult[] {
  // Apply realtime gating: if spec.realtime is false, drop rows missing rsi
  // from the universe (simulating "no live data" → not eligible for rsi criteria).
  let pool = universe;
  if (!spec.realtime) {
    pool = universe.filter(r => r.rsi !== undefined);
  }
  const matched: ScreenResult[] = [];
  for (const row of pool) {
    const reasons: string[] = [];
    let pass = true;
    for (const clause of spec.filters) {
      if (evaluateClause(row, clause)) {
        reasons.push(`${clause.field} ${clause.op} ${JSON.stringify(clause.value)}`);
      } else {
        pass = false;
        break;
      }
    }
    if (pass) {
      const s = scoreRow(row, spec.template, spec);
      matched.push({
        ticker: row.ticker,
        name: row.name,
        sector: row.sector,
        score: s,
        matchedCriteria: reasons,
        metrics: {
          marketCap: row.marketCap,
          pe: row.pe,
          pb: row.pb,
          roe: row.roe,
          revenueGrowth: row.revenueGrowth,
          rsi: row.rsi,
        },
        thesis: buildThesis(row, spec.template),
      });
    }
  }
  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, spec.limit);
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const NL_SCREEN_DESCRIPTION = `## nl_screen
Natural-language stock screener (Gap G4). Translates the user's free-form query into a typed FilterSpec, executes it against the screening universe, and returns a ranked list with a 1-sentence thesis per result.

**When to use**:
- "AAPL-like 跌深质量复利 ex-金融" — find compounders excluding finance
- "PE < 15 且 ROE > 20%" — value + quality screen
- "RSI < 35" — oversold candidates
- "市值 $10B-$50B 且 non-finance" — mid-cap screen
- "复利型 组合" — multi-factor compound screen

**Reuse**: schema lives in \`src/plan/filter-spec.ts\`; 1-line thesis is template-driven (decision-dashboard is the heavy scorer, used in P2).`;

const NlScreenSchema = z.object({
  query: z.string().describe('Natural-language screening query (Chinese or English)'),
  universe: z.enum(['us', 'cn', 'hk', 'crypto']).default('us'),
  limit: z.number().int().min(1).max(500).default(50),
  realtime: z.boolean().default(false),
});

export interface NlScreenDeps {
  parser?: NlParserFn;
  universe?: StockRow[];
  /** Validate the LLM's emitted FilterSpec before execution. */
  validateSpec?: boolean;
}

export function createNlScreenTool(deps: NlScreenDeps = {}): StructuredToolInterface {
  const parser = deps.parser ?? deterministicNlParser;
  const universe = deps.universe ?? DEFAULT_UNIVERSE;
  const validateSpec = deps.validateSpec ?? true;

  return new DynamicStructuredTool({
    name: 'nl_screen',
    description: NL_SCREEN_DESCRIPTION,
    schema: NlScreenSchema,
    async func(input) {
      const upper = (input.universe ?? 'us') as Universe;
      const limit = input.limit ?? 50;
      const realtime = input.realtime ?? false;
      const spec = parser(input.query, upper);
      // Apply the runtime overrides on top of parser output
      const finalSpec: FilterSpec = { ...spec, limit, realtime };

      if (validateSpec) {
        const v = safeParseFilterSpec(finalSpec);
        if (!v.ok) {
          return JSON.stringify({ error: `Invalid FilterSpec: ${v.error}`, query: input.query });
        }
      }

      const results = executeFilterSpec(finalSpec, universe);
      const out: NlScreenOutput = {
        source: 'nl_screen',
        query: input.query,
        universe: upper,
        ...(finalSpec.template !== undefined && { template: finalSpec.template }),
        filterCount: finalSpec.filters.length,
        scannedCount: universe.length,
        matchedCount: results.length,
        results,
      };
      return JSON.stringify(out);
    },
  });
}
