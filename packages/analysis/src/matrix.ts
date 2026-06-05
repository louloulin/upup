/**
 * Matrix Analysis — Hebbia-style cross-ticker × cross-dimension matrix.
 *
 * Public surface:
 *   - `MatrixEngine`       : build pivoted matrix from injected cell data
 *   - `renderVerdict`      : per-dimension template-driven short verdict
 *   - `toCSV` / `toMarkdown`: pivoted export
 *   - `DEFAULT_TICKERS_UNIVERSE` : 50-ticker default (25 A-share + 25 US)
 *   - `buildMatrixAnalysisTool` : LangChain tool factory
 *
 * Design:
 *   - The engine does NOT fetch data — it consumes cells produced upstream
 *     (financial_search / news / dragon_tiger / etc.). This keeps the
 *     matrix deterministic, testable, and offline.
 *   - The default resolver is `null` (no data). Callers can inject a
 *     resolver that wires real data sources.
 *   - Verdicts are templated, not LLM-generated, so they are fast and
 *     deterministic. The LLM can later enrich them via the agent loop.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { isFeatureCompiledIn } from '@upup/agent/feature-gates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const DIMENSIONS = ['technical', 'fundamental', 'flow', 'sentiment'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS_ZH: Record<Dimension, string> = {
  technical: '技术',
  fundamental: '基本面',
  flow: '资金',
  sentiment: '情绪',
};

export type MatrixCellMetrics = Record<string, number | string | undefined>;
export interface MatrixCellSource {
  kind: string;
  ref: string;
  /** ISO 8601 timestamp. */
  ts?: string;
}

export interface MatrixCell {
  ticker: string;
  dimension: Dimension;
  metrics: MatrixCellMetrics;
  /** Short human-readable verdict (1-2 sentences, Chinese). */
  verdict: string;
  /** -1.0 (bearish) .. +1.0 (bullish). */
  polarity: number;
  /** 0.0 .. 1.0 confidence / coverage. */
  confidence: number;
  sources: MatrixCellSource[];
}

export interface MatrixSpec {
  tickers: string[];
  dimensions: Dimension[];
}

export interface CellInput {
  metrics: MatrixCellMetrics;
  verdict?: string;
  polarity?: number;
  confidence?: number;
  sources?: MatrixCellSource[];
}

export type CellResolver = (ticker: string, dim: Dimension) => Promise<CellInput | null>;

export interface MatrixSummary {
  totalCells: number;
  totalPopulated: number;
  coverageByDim: Record<Dimension, number>;
  avgPolarityByDim: Record<Dimension, number>;
  topBullish: Array<{ ticker: string; dimension: Dimension; polarity: number; verdict: string }>;
  topBearish: Array<{ ticker: string; dimension: Dimension; polarity: number; verdict: string }>;
  /** Overall leaders: aggregated score per ticker, sorted desc. */
  overallLeaders: Array<{ ticker: string; score: number; coverage: number; rank: number }>;
}

export interface MatrixResult {
  spec: MatrixSpec;
  cells: MatrixCell[];
  summary: MatrixSummary;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Default 50-ticker universe (25 A-share + 25 US mega caps)
// ---------------------------------------------------------------------------

export const DEFAULT_TICKERS_UNIVERSE: string[] = [
  // A-share blue chips (25)
  '600519.SH', // 贵州茅台
  '601318.SH', // 中国平安
  '600036.SH', // 招商银行
  '000858.SZ', // 五粮液
  '000333.SZ', // 美的集团
  '600276.SH', // 恒瑞医药
  '601012.SH', // 隆基绿能
  '002594.SZ', // 比亚迪
  '600887.SH', // 伊利股份
  '000651.SZ', // 格力电器
  '601888.SH', // 中国中免
  '600030.SH', // 中信证券
  '600000.SH', // 浦发银行
  '601398.SH', // 工商银行
  '601939.SH', // 建设银行
  '600028.SH', // 中国石化
  '601857.SH', // 中国石油
  '601628.SH', // 中国人寿
  '600050.SH', // 中国联通
  '601800.SH', // 中国交建
  '002475.SZ', // 立讯精密
  '300750.SZ', // 宁德时代
  '002714.SZ', // 牧原股份
  '600900.SH', // 长江电力
  '601088.SH', // 中国神华
  // US mega caps (25)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B',
  'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX',
  'PFE', 'KO', 'PEP', 'MRK', 'ABBV', 'BAC', 'COST', 'DIS', 'CSCO',
];

// ---------------------------------------------------------------------------
// Verdict rendering — per-dimension templates
// ---------------------------------------------------------------------------

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number, digits = 2): string {
  return v.toFixed(digits);
}

function polLabel(p: number): string {
  if (p > 0.3) return '偏多';
  if (p < -0.3) return '偏空';
  return '中性';
}

/** Render a short Chinese verdict for a single cell, based on metrics. */
export function renderVerdict(dimension: Dimension, metrics: MatrixCellMetrics): {
  verdict: string;
  polarity: number;
  confidence: number;
} {
  switch (dimension) {
    case 'technical': {
      const mom = Number(metrics.momentum ?? 0);
      const vol = Number(metrics.volatility ?? 0);
      const rsi = Number(metrics.rsi ?? 50);
      const trend = mom > 0.05 ? '上升' : mom < -0.05 ? '下降' : '震荡';
      const oversold = rsi < 30 ? '(超卖)' : rsi > 70 ? '(超买)' : '';
      const polarity = clamp(mom * 3 + (rsi < 30 ? 0.3 : rsi > 70 ? -0.3 : 0), -1, 1);
      return {
        verdict: `技术面${trend}${oversold},动量${fmtPct(mom)},波动率${fmtPct(vol)},RSI=${fmtNum(rsi, 0)}`,
        polarity,
        confidence: metrics.rsi !== undefined ? 0.8 : 0.5,
      };
    }
    case 'fundamental': {
      const pe = Number(metrics.pe ?? 0);
      const pb = Number(metrics.pb ?? 0);
      const roe = Number(metrics.roe ?? 0);
      const revG = Number(metrics.revGrowth ?? 0);
      const peVerdict = pe === 0 ? '亏损' : pe < 15 ? '低估' : pe < 30 ? '合理' : '高估';
      const roeVerdict = roe > 0.15 ? '优秀' : roe > 0.08 ? '良好' : '一般';
      const polarity = clamp(
        (pe > 0 && pe < 20 ? 0.3 : pe > 50 ? -0.3 : 0) +
        (roe > 0.15 ? 0.4 : roe < 0.05 ? -0.2 : 0) +
        (revG > 0.2 ? 0.3 : revG < 0 ? -0.3 : 0),
        -1, 1,
      );
      return {
        verdict: `PE=${fmtNum(pe, 1)}(${peVerdict}),PB=${fmtNum(pb, 2)},ROE=${fmtPct(roe)}(${roeVerdict}),营收增长${fmtPct(revG)}`,
        polarity,
        confidence: pe && roe ? 0.85 : 0.5,
      };
    }
    case 'flow': {
      const netInflow = Number(metrics.netInflow ?? 0); // in 亿
      const nb = Number(metrics.northbound ?? 0); // in 亿
      const inst = Number(metrics.institutional ?? 0);
      const direction = netInflow > 0 ? '净流入' : netInflow < 0 ? '净流出' : '平衡';
      const polarity = clamp(
        (netInflow > 1 ? 0.3 : netInflow < -1 ? -0.3 : 0) +
        (nb > 0.5 ? 0.2 : nb < -0.5 ? -0.2 : 0) +
        (inst > 0.5 ? 0.2 : inst < -0.5 ? -0.2 : 0),
        -1, 1,
      );
      return {
        verdict: `主力${direction}${fmtNum(Math.abs(netInflow), 1)}亿,北向${nb >= 0 ? '+' : ''}${fmtNum(nb, 1)}亿,机构${inst >= 0 ? '+' : ''}${fmtNum(inst, 1)}亿`,
        polarity,
        confidence: netInflow !== undefined ? 0.75 : 0.4,
      };
    }
    case 'sentiment': {
      const score = Number(metrics.sentimentScore ?? 0); // -1..+1
      const news = Number(metrics.newsCount ?? 0);
      const brokerRating = Number(metrics.brokerConsensus ?? 0); // 1=buy..5=sell
      const rating = brokerRating > 0 ? (brokerRating <= 2 ? '推荐' : brokerRating <= 3.5 ? '中性' : '回避') : '无';
      const polarity = clamp(
        score * 0.6 +
        (brokerRating > 0 ? (3.5 - brokerRating) / 5 : 0),
        -1, 1,
      );
      return {
        verdict: `舆情${polLabel(score)}(score=${fmtNum(score, 2)}),${news}条相关新闻,券商一致预期${rating}`,
        polarity,
        confidence: news > 0 ? Math.min(0.9, 0.3 + news * 0.05) : 0.3,
      };
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// MatrixEngine
// ---------------------------------------------------------------------------

export class MatrixEngine {
  private spec: MatrixSpec;
  private resolver: CellResolver;
  private cells: Map<string, MatrixCell> = new Map();
  private built = false;

  constructor(spec: MatrixSpec, resolver: CellResolver = async () => null) {
    // Validate + dedup
    if (!spec.tickers.length) throw new Error('MatrixSpec.tickers is empty');
    if (!spec.dimensions.length) throw new Error('MatrixSpec.dimensions is empty');
    for (const d of spec.dimensions) {
      if (!DIMENSIONS.includes(d)) {
        throw new Error(`Unknown dimension: ${d}. Valid: ${DIMENSIONS.join(', ')}`);
      }
    }
    this.spec = {
      tickers: [...new Set(spec.tickers)],
      dimensions: [...new Set(spec.dimensions)],
    };
    this.resolver = resolver;
  }

  /** Manually inject a fully-formed cell. Idempotent by (ticker, dimension). */
  setCell(cell: MatrixCell): void {
    if (!this.spec.tickers.includes(cell.ticker)) {
      throw new Error(`Ticker ${cell.ticker} not in spec.tickers`);
    }
    if (!this.spec.dimensions.includes(cell.dimension)) {
      throw new Error(`Dimension ${cell.dimension} not in spec.dimensions`);
    }
    const key = cellKey(cell.ticker, cell.dimension);
    this.cells.set(key, cell);
    this.built = false;
  }

  /** Bulk set multiple cells. */
  setCells(cells: MatrixCell[]): void {
    for (const c of cells) this.setCell(c);
  }

  size(): number {
    return this.cells.size;
  }

  listCells(): MatrixCell[] {
    return [...this.cells.values()];
  }

  /**
   * Build the matrix: for each (ticker, dimension) pair, call the resolver
   * to populate the cell. Cells already injected via setCell() are kept.
   * Resolver-returned cells get a verdict auto-rendered if not provided.
   */
  async build(): Promise<MatrixResult> {
    const tasks: Promise<void>[] = [];
    for (const ticker of this.spec.tickers) {
      for (const dim of this.spec.dimensions) {
        const key = cellKey(ticker, dim);
        if (this.cells.has(key)) continue; // already injected
        tasks.push(this.resolveOne(ticker, dim));
      }
    }
    await Promise.all(tasks);
    this.built = true;
    return this.summarize();
  }

  private async resolveOne(ticker: string, dim: Dimension): Promise<void> {
    try {
      const input = await this.resolver(ticker, dim);
      if (!input) return; // no data
      const rendered = renderVerdict(dim, input.metrics);
      this.cells.set(cellKey(ticker, dim), {
        ticker,
        dimension: dim,
        metrics: input.metrics,
        verdict: input.verdict ?? rendered.verdict,
        polarity: input.polarity ?? rendered.polarity,
        confidence: input.confidence ?? rendered.confidence,
        sources: input.sources ?? [],
      });
    } catch {
      // resolver errors should never crash the matrix — leave cell empty
    }
  }

  /** Compute summary statistics over current cells. */
  private summarize(): MatrixResult {
    const cells = [...this.cells.values()];
    const coverage: Record<Dimension, number> = {
      technical: 0, fundamental: 0, flow: 0, sentiment: 0,
    };
    const polaritySum: Record<Dimension, number> = {
      technical: 0, fundamental: 0, flow: 0, sentiment: 0,
    };
    const polarityCount: Record<Dimension, number> = {
      technical: 0, fundamental: 0, flow: 0, sentiment: 0,
    };
    for (const c of cells) {
      coverage[c.dimension]++;
      polaritySum[c.dimension] += c.polarity;
      polarityCount[c.dimension]++;
    }
    const avgPolarityByDim: Record<Dimension, number> = {
      technical: 0, fundamental: 0, flow: 0, sentiment: 0,
    };
    for (const d of DIMENSIONS) {
      avgPolarityByDim[d] = polarityCount[d] > 0 ? polaritySum[d] / polarityCount[d] : 0;
    }
    // Top bullish / bearish
    const sortedByPol = [...cells].sort((a, b) => b.polarity - a.polarity);
    const topBullish = sortedByPol.slice(0, 5).map((c) => ({
      ticker: c.ticker, dimension: c.dimension, polarity: c.polarity, verdict: c.verdict,
    }));
    const topBearish = sortedByPol.slice(-5).reverse().map((c) => ({
      ticker: c.ticker, dimension: c.dimension, polarity: c.polarity, verdict: c.verdict,
    }));
    // Overall leaders: sum of (polarity * confidence) per ticker
    const tickerScore = new Map<string, { score: number; coverage: number; weight: number }>();
    for (const c of cells) {
      const cur = tickerScore.get(c.ticker) ?? { score: 0, coverage: 0, weight: 0 };
      cur.score += c.polarity * c.confidence;
      cur.weight += c.confidence;
      cur.coverage++;
      tickerScore.set(c.ticker, cur);
    }
    const overallLeaders = [...tickerScore.entries()]
      .map(([ticker, v]) => ({
        ticker,
        score: v.weight > 0 ? v.score / v.weight : 0,
        coverage: v.coverage,
      }))
      .sort((a, b) => b.score - a.score)
      .map((v, i) => ({ ...v, rank: i + 1 }));
    return {
      spec: this.spec,
      cells,
      summary: {
        totalCells: this.spec.tickers.length * this.spec.dimensions.length,
        totalPopulated: cells.length,
        coverageByDim: coverage,
        avgPolarityByDim,
        topBullish,
        topBearish,
        overallLeaders,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

function cellKey(ticker: string, dim: Dimension): string {
  return `${ticker}::${dim}`;
}

// ---------------------------------------------------------------------------
// Export — CSV and Markdown
// ---------------------------------------------------------------------------

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(result: MatrixResult): string {
  const header = ['ticker', 'dimension', 'dimension_zh', 'polarity', 'confidence', 'verdict', 'metrics'];
  const lines: string[] = [header.join(',')];
  for (const c of result.cells) {
    lines.push([
      csvEscape(c.ticker),
      csvEscape(c.dimension),
      csvEscape(DIMENSION_LABELS_ZH[c.dimension]),
      csvEscape(c.polarity.toFixed(3)),
      csvEscape(c.confidence.toFixed(3)),
      csvEscape(c.verdict),
      csvEscape(JSON.stringify(c.metrics)),
    ].join(','));
  }
  return lines.join('\n');
}

export function toMarkdown(result: MatrixResult): string {
  const lines: string[] = [];
  lines.push(`# 投资矩阵分析`);
  lines.push('');
  lines.push(`- 生成时间: ${result.generatedAt}`);
  lines.push(`- 标的数: ${result.spec.tickers.length}`);
  lines.push(`- 维度数: ${result.spec.dimensions.length} (${result.spec.dimensions.map((d) => DIMENSION_LABELS_ZH[d]).join(' / ')})`);
  lines.push(`- 已填充 cell: ${result.summary.totalPopulated} / ${result.summary.totalCells}`);
  lines.push('');
  // Pivoted table: rows = tickers, cols = dimensions
  const headerCells = ['标的', ...result.spec.dimensions.map((d) => DIMENSION_LABELS_ZH[d])];
  lines.push(`| ${headerCells.join(' | ')} |`);
  lines.push(`| ${headerCells.map(() => '---').join(' | ')} |`);
  const cellsByTicker = new Map<string, Map<Dimension, MatrixCell>>();
  for (const c of result.cells) {
    if (!cellsByTicker.has(c.ticker)) cellsByTicker.set(c.ticker, new Map());
    cellsByTicker.get(c.ticker)!.set(c.dimension, c);
  }
  for (const ticker of result.spec.tickers) {
    const row: string[] = [ticker];
    const perDim = cellsByTicker.get(ticker);
    for (const dim of result.spec.dimensions) {
      const c = perDim?.get(dim);
      if (!c) { row.push('—'); continue; }
      const arrow = c.polarity > 0.2 ? '🟢' : c.polarity < -0.2 ? '🔴' : '⚪';
      row.push(`${arrow} ${c.verdict}`);
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  // Summary section
  lines.push('');
  lines.push(`## 综合排行`);
  lines.push('');
  lines.push(`### 整体得分前 10`);
  lines.push('');
  lines.push(`| 排名 | 标的 | 得分 | 覆盖维度 |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const v of result.summary.overallLeaders.slice(0, 10)) {
    lines.push(`| ${v.rank} | ${v.ticker} | ${v.score.toFixed(3)} | ${v.coverage} |`);
  }
  lines.push('');
  lines.push(`### 各维度均值情绪`);
  lines.push('');
  lines.push(`| 维度 | 均值 polarity | 覆盖 |`);
  lines.push(`| --- | --- | --- |`);
  for (const d of result.spec.dimensions) {
    lines.push(`| ${DIMENSION_LABELS_ZH[d]} | ${result.summary.avgPolarityByDim[d].toFixed(3)} | ${result.summary.coverageByDim[d]} |`);
  }
  lines.push('');
  lines.push(`### 最看多 (top 5)`);
  lines.push('');
  for (const v of result.summary.topBullish) {
    lines.push(`- **${v.ticker} · ${DIMENSION_LABELS_ZH[v.dimension]}** (${v.polarity.toFixed(2)}): ${v.verdict}`);
  }
  lines.push('');
  lines.push(`### 最看空 (top 5)`);
  lines.push('');
  for (const v of result.summary.topBearish) {
    lines.push(`- **${v.ticker} · ${DIMENSION_LABELS_ZH[v.dimension]}** (${v.polarity.toFixed(2)}): ${v.verdict}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool — `matrix_analysis`
// ---------------------------------------------------------------------------

const MatrixAnalysisSchema = z.object({
  tickers: z.array(z.string()).min(1).max(100).optional()
    .describe('Tickers to include. Defaults to DEFAULT_TICKERS_UNIVERSE (50 tickers).'),
  dimensions: z.array(z.enum(['technical', 'fundamental', 'flow', 'sentiment'])).min(1).max(4)
    .optional()
    .describe('Dimensions to analyze. Defaults to all 4.'),
  /** Pre-populated cells (used when the caller has already gathered data). */
  cells: z.array(z.object({
    ticker: z.string(),
    dimension: z.enum(['technical', 'fundamental', 'flow', 'sentiment']),
    metrics: z.record(z.union([z.number(), z.string()])),
    verdict: z.string().optional(),
    polarity: z.number().min(-1).max(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    sources: z.array(z.object({
      kind: z.string(),
      ref: z.string(),
      ts: z.string().optional(),
    })).optional(),
  })).optional()
    .describe('Pre-populated cell data (sourced from upstream tools).'),
  format: z.enum(['json', 'csv', 'markdown']).default('json')
    .describe('Output format.'),
  limit: z.number().int().min(1).max(100).optional()
    .describe('Cap the number of cells returned (for very large matrices).'),
});

const MATRIX_ANALYSIS_DESCRIPTION = `## matrix_analysis
Hebbia-style cross-ticker × cross-dimension matrix analysis.

**When to use**:
- The user wants a quick comparative view across many tickers (e.g. "scan the top 50 A-shares", "compare the AI basket", "show me which tech names are most oversold").
- The user wants each ticker scored on multiple dimensions (技术 / 基本面 / 资金 / 情绪).
- The user wants a per-cell short verdict in Chinese that summarizes the key metric.

**Input**:
- tickers: list of tickers (1-100, defaults to 50-ticker universe: 25 A-share + 25 US)
- dimensions: which dimensions to include (defaults to all 4)
- cells: optional pre-populated cell data — if provided, no resolver is invoked
- format: json | csv | markdown (default json)
- limit: cap cell count in output

**Output**:
- pivoted markdown table (ticker × dimension with verdict per cell)
- summary section: top 10 overall leaders, per-dim avg sentiment, top 5 bullish/bearish cells
- raw cells with metrics, polarity, confidence, sources

**Architecture**: pure function — does NOT fetch data. Caller must provide \`cells\` (via upstream tools like financial_search / news) or plug a custom resolver at engine init. This keeps the matrix deterministic, testable, and free of LLM cost in the hot path.

**When NOT to use**:
- Single-ticker deep dive (use generate_research_report)
- Real-time quote stream (use realtime_feed)
- Order execution (use trade_* tools)
`;

export function buildMatrixAnalysisTool(
  resolver?: CellResolver,
): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'matrix_analysis',
    description: MATRIX_ANALYSIS_DESCRIPTION,
    schema: MatrixAnalysisSchema,
    func: async (input) => {
      if (!isFeatureCompiledIn('RESEARCH_TOOL')) {
        return JSON.stringify({
          error: 'feature_disabled',
          message: 'matrix_analysis is gated by RESEARCH_TOOL. Set BUN_CONFIG_FEATURE_RESEARCH_TOOL=1 to enable.',
        });
      }
      try {
        const spec: MatrixSpec = {
          tickers: input.tickers ?? DEFAULT_TICKERS_UNIVERSE,
          dimensions: input.dimensions ?? [...DIMENSIONS],
        };
        const engine = new MatrixEngine(spec, resolver);
        if (input.cells?.length) {
          // Validate injected cells against spec
          const tickerSet = new Set(spec.tickers);
          const dimSet = new Set(spec.dimensions);
          for (const c of input.cells) {
            if (!tickerSet.has(c.ticker)) continue;
            if (!dimSet.has(c.dimension)) continue;
            engine.setCell({
              ticker: c.ticker,
              dimension: c.dimension,
              metrics: c.metrics,
              verdict: c.verdict ?? '',
              polarity: c.polarity ?? 0,
              confidence: c.confidence ?? 0.5,
              sources: c.sources ?? [],
            });
          }
        }
        const result = await engine.build();
        // Cap output if requested
        if (input.limit && result.cells.length > input.limit) {
          result.cells = result.cells.slice(0, input.limit);
        }
        if (input.format === 'csv') return toCSV(result);
        if (input.format === 'markdown') return toMarkdown(result);
        return JSON.stringify({
          spec: result.spec,
          summary: result.summary,
          generatedAt: result.generatedAt,
          cells: result.cells.map((c) => ({
            ticker: c.ticker,
            dimension: c.dimension,
            dimensionZh: DIMENSION_LABELS_ZH[c.dimension],
            metrics: c.metrics,
            verdict: c.verdict,
            polarity: Number(c.polarity.toFixed(3)),
            confidence: Number(c.confidence.toFixed(3)),
            sources: c.sources,
          })),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ error: 'matrix_failed', message });
      }
    },
  });
}

/** Default factory — no resolver. Cells must be provided in input. */
export const createMatrixAnalysisTool = (): StructuredToolInterface => buildMatrixAnalysisTool();
