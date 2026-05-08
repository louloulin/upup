/**
 * Tests for DecisionDashboard
 */

import { describe, it, expect } from 'vitest';
import {
  DecisionDashboardSchema,
  DECISION_DASHBOARD_DESCRIPTION,
  createDecisionDashboardTool,
} from './decision-dashboard.js';

describe('DecisionDashboardSchema', () => {
  it('should parse minimal input with just symbol', () => {
    const result = DecisionDashboardSchema.safeParse({ symbol: 'AAPL' });
    expect(result.success).toBe(true);
  });

  it('should parse full input', () => {
    const result = DecisionDashboardSchema.safeParse({
      symbol: 'AAPL',
      technical: {
        trend: 'uptrend',
        rsi: 55,
        macd_signal: 'bullish',
        support_distance_pct: 3,
      },
      fundamental: {
        pe_ratio: 25,
        pb_ratio: 40,
        roe: 0.3,
        revenue_growth: 0.12,
        profit_margin: 0.25,
      },
      sentiment: {
        news_sentiment: 'positive',
        analyst_rating: 'buy',
        social_buzz: 'bullish',
      },
      risk: {
        volatility: 0.2,
        beta: 1.1,
        max_drawdown: -0.15,
        debt_to_equity: 0.5,
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty symbol', () => {
    const result = DecisionDashboardSchema.safeParse({ symbol: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid trend', () => {
    const result = DecisionDashboardSchema.safeParse({
      symbol: 'AAPL',
      technical: { trend: 'up' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject RSI out of range', () => {
    const result = DecisionDashboardSchema.safeParse({
      symbol: 'AAPL',
      technical: { rsi: 150 },
    });
    expect(result.success).toBe(false);
  });
});

describe('DECISION_DASHBOARD_DESCRIPTION', () => {
  it('should have non-empty description', () => {
    expect(DECISION_DASHBOARD_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention four dimensions', () => {
    expect(DECISION_DASHBOARD_DESCRIPTION).toMatch(/technical/i);
    expect(DECISION_DASHBOARD_DESCRIPTION).toMatch(/fundamental/i);
    expect(DECISION_DASHBOARD_DESCRIPTION).toMatch(/sentiment/i);
    expect(DECISION_DASHBOARD_DESCRIPTION).toMatch(/risk/i);
  });
});

describe('createDecisionDashboardTool', () => {
  it('should create tool with correct name', () => {
    const tool = createDecisionDashboardTool();
    expect(tool.name).toBe('decision_dashboard');
  });

  it('should have callable func', () => {
    const tool = createDecisionDashboardTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should generate report with symbol', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({ symbol: 'AAPL' });
    expect(result).toContain('AAPL');
    expect(result).toContain('Decision Dashboard');
    expect(result).toContain('Overall Score');
  });

  it('should include all four dimensions', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({ symbol: 'MSFT' });
    expect(result).toContain('Technical');
    expect(result).toContain('Fundamental');
    expect(result).toContain('Sentiment');
    expect(result).toContain('Risk');
  });

  it('should return STRONG_BUY for strong positive signals', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({
      symbol: 'GREAT',
      technical: { trend: 'uptrend', rsi: 25, macd_signal: 'bullish' },
      fundamental: { pe_ratio: 8, pb_ratio: 0.8, roe: 0.35, revenue_growth: 0.3, profit_margin: 0.3 },
      sentiment: { news_sentiment: 'positive', analyst_rating: 'strong_buy', social_buzz: 'bullish' },
      risk: { volatility: 0.1, beta: 0.5, max_drawdown: -0.05, debt_to_equity: 0.1 },
    });
    expect(result).toContain('STRONG_BUY');
  });

  it('should return STRONG_SELL for strong negative signals', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({
      symbol: 'BAD',
      technical: { trend: 'downtrend', rsi: 85, macd_signal: 'bearish' },
      fundamental: { pe_ratio: 100, pb_ratio: 10, roe: -0.1, revenue_growth: -0.1, profit_margin: -0.05 },
      sentiment: { news_sentiment: 'negative', analyst_rating: 'strong_sell', social_buzz: 'bearish' },
      risk: { volatility: 0.5, beta: 2.0, max_drawdown: -0.6, debt_to_equity: 3 },
    });
    expect(result).toContain('STRONG_SELL');
  });

  it('should return HOLD for neutral signals', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({
      symbol: 'NEUTRAL',
      technical: { trend: 'sideways', rsi: 50 },
      fundamental: { pe_ratio: 15, roe: 0.1 },
      sentiment: { analyst_rating: 'hold' },
      risk: { volatility: 0.2, beta: 1.0 },
    });
    expect(result).toContain('HOLD');
  });

  it('should include recommendation text', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({ symbol: 'TEST' });
    expect(result).toContain('Recommendation');
  });

  it('should include markdown formatting', async () => {
    const tool = createDecisionDashboardTool();
    const result = await tool.func({ symbol: 'TEST' });
    expect(result).toContain('# TEST');
    expect(result).toContain('## Signal');
    expect(result).toContain('---');
  });
});
