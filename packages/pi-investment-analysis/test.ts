import { describe, expect, test } from 'bun:test';
import { calculateDcf, calculateProductionDcf, calculateProductionDdm, calculateQuickTargetPrice, calculateTargetPrice, calculateTechnicalSignal, calculateValuationRatios, comparePeers, calculateOptionPrice, calculateImpliedVolatility, calculateTechnicalIndicators, calculateKdj, calculateBoll, calculateWr, calculateCci, calculateAtr, calculateObv, calculateDecisionDashboard } from './src/index.js';

describe('pi-investment-analysis', () => {
  test('calculates DCF with explicit assumptions', () => {
    const result = calculateDcf({ currentFcf: 100, growthRate: 0.08, discountRate: 0.1, terminalGrowthRate: 0.03, projectionYears: 5, sharesOutstanding: 10 });
    expect(result.fairValuePerShare).toBeGreaterThan(0);
    expect(result.projectedCashFlows).toHaveLength(5);
    expect(result.assumptions.discountRate).toBe(0.1);
  });

  test('calculates production-compatible DCF with net debt and optional per-share value', () => {
    const result = calculateProductionDcf({ current_fcf: 100, growth_rate: 0.08, discount_rate: 0.1, terminal_growth_rate: 0.03, projection_years: 5, shares_outstanding: 10, net_debt: 20 });
    expect(result.equity_value).toBeLessThan(result.enterprise_value);
    expect(result.intrinsic_value_per_share).toBeGreaterThan(0);
    expect(result.pv_of_fcf).toHaveLength(5);
  });

  test('calculates production-compatible DDM with optional upside', () => {
    const result = calculateProductionDdm({ symbol: '600519.SH', current_dividend: 2, growth_rate: 0.05, required_return: 0.1, terminal_growth_rate: 0.03, projection_years: 5, current_price: 30 });
    expect(result.symbol).toBe('600519.SH');
    expect(result.projected_dividends).toHaveLength(5);
    expect(result.target_price).toBeGreaterThan(0);
    expect(result.upside_percent).toBeDefined();
  });

  test('classifies moving-average distance deterministically', () => {
    expect(calculateTechnicalSignal([{ date: '2026-09-01', close: 10 }, { date: '2026-09-02', close: 10 }, { date: '2026-09-03', close: 11 }]).trend).toBe('bullish');
  });

  test('rejects an unsafe terminal growth assumption', () => {
    expect(() => calculateDcf({ currentFcf: 100, growthRate: 0.08, discountRate: 0.03, terminalGrowthRate: 0.04, projectionYears: 5, sharesOutstanding: 10 })).toThrow('discountRate');
  });
  test('calculates valuation ratios with explicit per-share fallbacks', () => {
    expect(calculateValuationRatios({ price: 150, eps: 10, total_equity: 500, operating_cash_flow: 80, shares_outstanding: 10 })).toMatchObject({ pe_ratio: 15, pb_ratio: 3, pcf_ratio: 18.75, market_cap: 1500 });
  });
  test('compares peers with deterministic percentile statistics', () => {
    const result = comparePeers({ target: { name: 'Target', pe_ratio: 18, roe: 0.15 }, peers: [{ name: 'A', pe_ratio: 20, roe: 0.14 }, { name: 'B', pe_ratio: 16, roe: 0.16 }] });
    expect(result.metrics.pe_ratio).toMatchObject({ peer_avg: 18, peer_min: 16, peer_max: 20, percentile: 50 });
    expect(result.summary).toContain('peer avg');
  });
  test('calculates production target prices through all methods', () => {
    const pe = calculateTargetPrice({ symbol: 'AAPL', currentPrice: 150, method: 'pe', currentEps: 6, forwardEps: 7, targetPe: 25, peYears: 3 });
    const sotp = calculateTargetPrice({ symbol: 'BRK.B', currentPrice: 350, method: 'sotp', components: [{ name: 'Insurance', value: 200, weight: 1 }, { name: 'Railroad', value: 100, weight: 1 }, { name: 'Energy', value: 80, weight: 1 }] });
    const quick = calculateQuickTargetPrice({ symbol: 'TSLA', currentPrice: 200, currentEps: 4, forwardEps: 5.5, growthRate: 0.25 });
    expect(pe.targetPrice).toBe(175);
    expect(sotp.targetPrice).toBe(380);
    expect(quick.targetPrice).toBe(275);
  });
  test('calculates option price, Greeks, and implied volatility deterministically', () => {
    const input = { spotPrice: 100, strikePrice: 100, timeToExpiry: 180, riskFreeRate: 0.05, volatility: 0.25, optionType: 'call' as const };
    const result = calculateOptionPrice(input);
    expect(result.price).toBeGreaterThan(0);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.gamma).toBeGreaterThan(0);
    expect(calculateImpliedVolatility({ marketPrice: result.price, ...input, })).toBeCloseTo(0.25, 2);
  });
  test('calculates native technical indicators from OHLCV data', () => {
    const bars = Array.from({ length: 25 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000 + index * 10 }));
    expect(calculateKdj(bars).indicator).toBe('KDJ');
    expect(calculateBoll(bars).values.length).toBe(6);
    expect(calculateTechnicalIndicators(bars)).toMatchObject({ dataPoints: 25, indicatorsCalculated: 6 });
    expect(calculateWr(bars).indicator).toBe('WR');
    expect(calculateCci(bars).indicator).toBe('CCI');
    expect(calculateAtr(bars).indicator).toBe('ATR');
    expect(calculateObv(bars).indicator).toBe('OBV');
  });
  test('calculates a deterministic four-dimension decision dashboard', () => {
    const result = calculateDecisionDashboard({
      symbol: 'AAPL',
      technical: { trend: 'uptrend', rsi: 45, macd_signal: 'bullish' },
      fundamental: { pe_ratio: 12, roe: 0.22, revenue_growth: 0.25, profit_margin: 0.25 },
      sentiment: { news_sentiment: 'positive', analyst_rating: 'strong_buy', social_buzz: 'bullish' },
      risk: { volatility: 0.1, beta: 0.7, max_drawdown: 0.05, debt_to_equity: 0.2 },
    });
    expect(result.signal).toBe('STRONG_BUY');
    expect(result.overall_score).toBeGreaterThanOrEqual(80);
    expect(result.dimensions).toHaveLength(4);
    expect(result.report).toContain('# AAPL Decision Dashboard');
    expect(result.report).toContain('Recommendation');
  });
});
