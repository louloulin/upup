/**
 * DecisionDashboard - Investment decision support
 *
 * Four-dimension scoring system (technical, fundamental, sentiment, risk),
 * buy/sell signals, and markdown report generation.
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';

// ============================================================================
// Types
// ============================================================================

export interface DimensionScore {
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
  details: string[];
}

export interface DecisionResult {
  symbol: string;
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  overall_score: number;
  dimensions: DimensionScore[];
  recommendation: string;
  report: string;
}

// ============================================================================
// Scoring Logic
// ============================================================================

function scoreTechnical(input: {
  trend?: string;
  rsi?: number;
  macd_signal?: string;
  support_distance_pct?: number;
}): DimensionScore {
  const details: string[] = [];
  let score = 50; // neutral

  // Trend
  if (input.trend) {
    if (input.trend === 'uptrend') { score += 15; details.push('Uptrend (+15)'); }
    else if (input.trend === 'downtrend') { score -= 15; details.push('Downtrend (-15)'); }
    else { details.push('Sideways (0)'); }
  }

  // RSI
  if (input.rsi !== undefined) {
    if (input.rsi < 30) { score += 20; details.push(`RSI ${input.rsi.toFixed(1)} oversold (+20)`); }
    else if (input.rsi < 40) { score += 10; details.push(`RSI ${input.rsi.toFixed(1)} approaching oversold (+10)`); }
    else if (input.rsi > 70) { score -= 20; details.push(`RSI ${input.rsi.toFixed(1)} overbought (-20)`); }
    else if (input.rsi > 60) { score -= 5; details.push(`RSI ${input.rsi.toFixed(1)} elevated (-5)`); }
    else { details.push(`RSI ${input.rsi.toFixed(1)} neutral (0)`); }
  }

  // MACD
  if (input.macd_signal) {
    if (input.macd_signal === 'bullish') { score += 10; details.push('MACD bullish (+10)'); }
    else if (input.macd_signal === 'bearish') { score -= 10; details.push('MACD bearish (-10)'); }
  }

  // Support distance
  if (input.support_distance_pct !== undefined) {
    if (input.support_distance_pct < 2) { score += 5; details.push('Near support (+5)'); }
    else if (input.support_distance_pct > 15) { score -= 5; details.push('Far from support (-5)'); }
  }

  return { label: 'Technical', score: Math.max(0, Math.min(100, score)), weight: 0.25, details };
}

function scoreFundamental(input: {
  pe_ratio?: number;
  pb_ratio?: number;
  roe?: number;
  revenue_growth?: number;
  profit_margin?: number;
}): DimensionScore {
  const details: string[] = [];
  let score = 50;

  // PE Ratio (lower is better for value)
  if (input.pe_ratio !== undefined) {
    if (input.pe_ratio < 0) { score -= 10; details.push(`PE ${input.pe_ratio.toFixed(1)} negative (-10)`); }
    else if (input.pe_ratio < 10) { score += 15; details.push(`PE ${input.pe_ratio.toFixed(1)} cheap (+15)`); }
    else if (input.pe_ratio < 20) { score += 5; details.push(`PE ${input.pe_ratio.toFixed(1)} fair (+5)`); }
    else if (input.pe_ratio < 35) { score -= 5; details.push(`PE ${input.pe_ratio.toFixed(1)} elevated (-5)`); }
    else { score -= 15; details.push(`PE ${input.pe_ratio.toFixed(1)} expensive (-15)`); }
  }

  // PB Ratio
  if (input.pb_ratio !== undefined) {
    if (input.pb_ratio < 1) { score += 10; details.push(`PB ${input.pb_ratio.toFixed(2)} below book (+10)`); }
    else if (input.pb_ratio < 3) { details.push(`PB ${input.pb_ratio.toFixed(2)} fair (0)`); }
    else { score -= 10; details.push(`PB ${input.pb_ratio.toFixed(2)} expensive (-10)`); }
  }

  // ROE
  if (input.roe !== undefined) {
    if (input.roe > 0.2) { score += 15; details.push(`ROE ${(input.roe * 100).toFixed(1)}% excellent (+15)`); }
    else if (input.roe > 0.1) { score += 5; details.push(`ROE ${(input.roe * 100).toFixed(1)}% good (+5)`); }
    else if (input.roe > 0) { details.push(`ROE ${(input.roe * 100).toFixed(1)}% low (0)`); }
    else { score -= 10; details.push(`ROE ${(input.roe * 100).toFixed(1)}% negative (-10)`); }
  }

  // Revenue growth
  if (input.revenue_growth !== undefined) {
    if (input.revenue_growth > 0.2) { score += 10; details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% high (+10)`); }
    else if (input.revenue_growth > 0.05) { score += 5; details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% moderate (+5)`); }
    else if (input.revenue_growth > 0) { details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% slow (0)`); }
    else { score -= 10; details.push(`Revenue growth ${(input.revenue_growth * 100).toFixed(1)}% declining (-10)`); }
  }

  // Profit margin
  if (input.profit_margin !== undefined) {
    if (input.profit_margin > 0.2) { score += 10; details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% strong (+10)`); }
    else if (input.profit_margin > 0.1) { score += 5; details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% decent (+5)`); }
    else if (input.profit_margin > 0) { details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% thin (0)`); }
    else { score -= 15; details.push(`Margin ${(input.profit_margin * 100).toFixed(1)}% negative (-15)`); }
  }

  return { label: 'Fundamental', score: Math.max(0, Math.min(100, score)), weight: 0.35, details };
}

function scoreSentiment(input: {
  news_sentiment?: string;
  analyst_rating?: string;
  social_buzz?: string;
}): DimensionScore {
  const details: string[] = [];
  let score = 50;

  if (input.news_sentiment) {
    if (input.news_sentiment === 'positive') { score += 15; details.push('News positive (+15)'); }
    else if (input.news_sentiment === 'negative') { score -= 15; details.push('News negative (-15)'); }
    else { details.push('News neutral (0)'); }
  }

  if (input.analyst_rating) {
    if (input.analyst_rating === 'strong_buy') { score += 20; details.push('Analysts: Strong Buy (+20)'); }
    else if (input.analyst_rating === 'buy') { score += 10; details.push('Analysts: Buy (+10)'); }
    else if (input.analyst_rating === 'sell') { score -= 15; details.push('Analysts: Sell (-15)'); }
    else if (input.analyst_rating === 'strong_sell') { score -= 20; details.push('Analysts: Strong Sell (-20)'); }
    else { details.push('Analysts: Hold (0)'); }
  }

  if (input.social_buzz) {
    if (input.social_buzz === 'bullish') { score += 5; details.push('Social bullish (+5)'); }
    else if (input.social_buzz === 'bearish') { score -= 5; details.push('Social bearish (-5)'); }
  }

  return { label: 'Sentiment', score: Math.max(0, Math.min(100, score)), weight: 0.15, details };
}

function scoreRisk(input: {
  volatility?: number;
  beta?: number;
  max_drawdown?: number;
  debt_to_equity?: number;
}): DimensionScore {
  const details: string[] = [];
  let score = 50;

  // Volatility (lower is better)
  if (input.volatility !== undefined) {
    if (input.volatility < 0.15) { score += 15; details.push(`Volatility ${(input.volatility * 100).toFixed(1)}% low (+15)`); }
    else if (input.volatility < 0.3) { details.push(`Volatility ${(input.volatility * 100).toFixed(1)}% moderate (0)`); }
    else { score -= 15; details.push(`Volatility ${(input.volatility * 100).toFixed(1)}% high (-15)`); }
  }

  // Beta
  if (input.beta !== undefined) {
    if (input.beta < 0.8) { score += 10; details.push(`Beta ${input.beta.toFixed(2)} defensive (+10)`); }
    else if (input.beta < 1.2) { details.push(`Beta ${input.beta.toFixed(2)} market-like (0)`); }
    else { score -= 10; details.push(`Beta ${input.beta.toFixed(2)} aggressive (-10)`); }
  }

  // Max drawdown (lower is better)
  if (input.max_drawdown !== undefined) {
    const ddPct = Math.abs(input.max_drawdown);
    if (ddPct < 0.1) { score += 10; details.push(`Max DD ${(ddPct * 100).toFixed(1)}% shallow (+10)`); }
    else if (ddPct < 0.3) { details.push(`Max DD ${(ddPct * 100).toFixed(1)}% moderate (0)`); }
    else { score -= 15; details.push(`Max DD ${(ddPct * 100).toFixed(1)}% severe (-15)`); }
  }

  // Debt to equity (lower is better)
  if (input.debt_to_equity !== undefined) {
    if (input.debt_to_equity < 0.3) { score += 10; details.push(`D/E ${input.debt_to_equity.toFixed(2)} low (+10)`); }
    else if (input.debt_to_equity < 1) { details.push(`D/E ${input.debt_to_equity.toFixed(2)} moderate (0)`); }
    else { score -= 10; details.push(`D/E ${input.debt_to_equity.toFixed(2)} high (-10)`); }
  }

  return { label: 'Risk', score: Math.max(0, Math.min(100, score)), weight: 0.25, details };
}

function overallSignal(overallScore: number): DecisionResult['signal'] {
  if (overallScore >= 80) return 'STRONG_BUY';
  if (overallScore >= 65) return 'BUY';
  if (overallScore >= 40) return 'HOLD';
  if (overallScore >= 25) return 'SELL';
  return 'STRONG_SELL';
}

function generateReport(symbol: string, result: DecisionResult): string {
  const signalIcon = {
    STRONG_BUY: '🟢🟢',
    BUY: '🟢',
    HOLD: '🟡',
    SELL: '🔴',
    STRONG_SELL: '🔴🔴',
  }[result.signal];

  const lines = [
    `# ${symbol} Decision Dashboard`,
    '',
    `## Signal: ${signalIcon} ${result.signal}`,
    `**Overall Score: ${result.overall_score.toFixed(1)}/100**`,
    '',
    '---',
    '',
  ];

  for (const dim of result.dimensions) {
    const bar = '█'.repeat(Math.round(dim.score / 10)) + '░'.repeat(10 - Math.round(dim.score / 10));
    const dimIcon = dim.score >= 65 ? '✅' : dim.score >= 40 ? '⚠️' : '❌';
    lines.push(`### ${dimIcon} ${dim.label} (${dim.score.toFixed(1)}/100, weight: ${(dim.weight * 100).toFixed(0)}%)`);
    lines.push(`[${bar}]`);
    for (const detail of dim.details) {
      lines.push(`  - ${detail}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`**Recommendation:** ${result.recommendation}`);

  return lines.join('\n');
}

// ============================================================================
// Schema
// ============================================================================

export const DecisionDashboardSchema = z.object({
  /** Stock symbol */
  symbol: z.string().min(1).max(20).describe('Stock ticker symbol'),
  /** Technical indicators */
  technical: z.object({
    trend: z.enum(['uptrend', 'downtrend', 'sideways']).optional(),
    rsi: z.number().min(0).max(100).optional(),
    macd_signal: z.enum(['bullish', 'bearish', 'neutral']).optional(),
    support_distance_pct: z.number().optional(),
  }).optional().describe('Technical analysis indicators'),
  /** Fundamental data */
  fundamental: z.object({
    pe_ratio: z.number().optional(),
    pb_ratio: z.number().optional(),
    roe: z.number().optional(),
    revenue_growth: z.number().optional(),
    profit_margin: z.number().optional(),
  }).optional().describe('Fundamental financial metrics'),
  /** Sentiment data */
  sentiment: z.object({
    news_sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
    analyst_rating: z.enum(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).optional(),
    social_buzz: z.enum(['bullish', 'bearish', 'neutral']).optional(),
  }).optional().describe('Market sentiment indicators'),
  /** Risk metrics */
  risk: z.object({
    volatility: z.number().optional(),
    beta: z.number().optional(),
    max_drawdown: z.number().optional(),
    debt_to_equity: z.number().optional(),
  }).optional().describe('Risk assessment metrics'),
});

export type DecisionDashboardInput = z.infer<typeof DecisionDashboardSchema>;

// ============================================================================
// Tool Description
// ============================================================================

export const DECISION_DASHBOARD_DESCRIPTION = `
Generate an investment decision dashboard with four-dimension scoring.

Use this when:
- Making a buy/sell/hold decision for a stock
- Getting a comprehensive assessment combining technical, fundamental, sentiment, and risk
- Generating a structured investment report

Dimensions scored (0-100):
- Technical (25%): Trend, RSI, MACD, support levels
- Fundamental (35%): PE, PB, ROE, revenue growth, margins
- Sentiment (15%): News, analyst ratings, social buzz
- Risk (25%): Volatility, beta, max drawdown, debt/equity

Returns a markdown report with signal and recommendation.`;

// ============================================================================
// Tool Factory
// ============================================================================

export function createDecisionDashboardTool(): PiTool {
  return new PiTool({
    name: 'decision_dashboard',
    description: DECISION_DASHBOARD_DESCRIPTION,
    schema: DecisionDashboardSchema,
    async func(input): Promise<string> {
      const dimensions: DimensionScore[] = [];

      dimensions.push(scoreTechnical(input.technical ?? {}));
      dimensions.push(scoreFundamental(input.fundamental ?? {}));
      dimensions.push(scoreSentiment(input.sentiment ?? {}));
      dimensions.push(scoreRisk(input.risk ?? {}));

      const overall_score = dimensions.reduce(
        (sum, dim) => sum + dim.score * dim.weight,
        0
      );

      const signal = overallSignal(overall_score);

      const recommendation = signal === 'STRONG_BUY'
        ? 'Strong conviction to buy. Multiple factors aligned positively.'
        : signal === 'BUY'
        ? 'Moderate conviction to buy. Most factors are positive.'
        : signal === 'HOLD'
        ? 'No strong signal. Maintain current position and monitor.'
        : signal === 'SELL'
        ? 'Moderate conviction to sell. Several factors are negative.'
        : 'Strong conviction to sell. Multiple risks identified.';

      const result: DecisionResult = {
        symbol: input.symbol,
        signal,
        overall_score,
        dimensions,
        recommendation,
        report: '',
      };

      result.report = generateReport(input.symbol, result);

      return result.report;
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
