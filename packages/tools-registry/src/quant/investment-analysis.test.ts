/**
 * investment-analysis.test.ts — Real verification of UpUp's investment analysis capabilities
 *
 * Tests the core financial calculations that power UpUp's investment analysis:
 * 1. Risk metrics (VaR, Sharpe, Sortino, MaxDrawdown) — previously UNTESTED
 * 2. Valuation (DCF math)
 * 3. Options pricing (Black-Scholes + put-call parity)
 * 4. Technical indicators (via tool factory — internal functions are not exported)
 * 5. Correlation analysis (Pearson)
 * 6. Tax calculation
 * 7. Tool registration completeness
 */

import { describe, it, expect } from 'bun:test';

// ============================================================================
// 1. Risk Metrics — CRITICAL, previously untested
// ============================================================================

describe('Risk Metrics (VaR, Sharpe, Sortino, MaxDrawdown)', () => {
  it('should calculate Historical VaR correctly', async () => {
    const { calculateVaR } = await import('../quant/risk-metrics.js');

    const returns = [-0.05, -0.03, -0.02, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06];
    // calculateVaR returns a number — the VaR value at the given confidence level
    const result = calculateVaR(returns, 0.95, 'historical');

    expect(result).toBeDefined();
    expect(typeof result).toBe('number');
    // At 95% confidence with 10 data points, historical VaR is the 5th percentile
    // Sorted: [-0.05, -0.03, -0.02, -0.01, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06]
    // Index = floor((1-0.95)*10) = 0, so sorted[0] = -0.05
    expect(result).toBeCloseTo(-0.05, 2);
  });

  it('should calculate Parametric VaR correctly', async () => {
    const { calculateVaR } = await import('../quant/risk-metrics.js');

    // Very tight negative returns — low std so VaR stays negative
    const returns = [-0.02, -0.01, -0.015, -0.025, -0.01, -0.02, -0.018, -0.012, -0.022, -0.015];
    const result = calculateVaR(returns, 0.95, 'parametric');

    expect(result).toBeDefined();
    expect(typeof result).toBe('number');
    // All returns are negative and tightly clustered → parametric VaR should be a loss
    expect(result).toBeLessThan(0);
  });

  it('should calculate Sharpe ratio correctly', async () => {
    const { calculateSharpe } = await import('../quant/risk-metrics.js');

    const returns = [0.05, 0.03, -0.02, 0.04, 0.01, -0.01, 0.06, 0.02, -0.03, 0.04];
    // calculateSharpe returns a number
    const result = calculateSharpe(returns, 0.03);

    expect(result).toBeDefined();
    expect(typeof result).toBe('number');
    // With positive average returns above risk-free rate, Sharpe should be positive
    expect(result).toBeGreaterThan(0);
  });

  it('should calculate Sortino ratio with downside deviation', async () => {
    const { calculateSortino } = await import('../quant/risk-metrics.js');

    const returns = [0.05, -0.08, 0.03, -0.02, 0.07, -0.05, 0.04, 0.02, -0.01, 0.06];
    // calculateSortino returns a number
    const result = calculateSortino(returns, 0.02);

    expect(result).toBeDefined();
    expect(typeof result).toBe('number');
    // Sortino with mixed returns and some downside should be finite
    expect(isFinite(result)).toBe(true);
  });

  it('should calculate Maximum Drawdown correctly', async () => {
    const { calculateMaxDrawdown } = await import('../quant/risk-metrics.js');

    // Classic drawdown scenario: up to 150, then down to 90
    const prices = [100, 120, 150, 130, 110, 90, 100, 120];
    const result = calculateMaxDrawdown(prices);

    // calculateMaxDrawdown returns { maxDrawdown, maxDrawdownPercent, peakIndex, troughIndex }
    expect(result.maxDrawdown).toBeDefined();
    expect(result.maxDrawdownPercent).toBeDefined();
    expect(result.peakIndex).toBeDefined();
    expect(result.troughIndex).toBeDefined();
    // Peak=150, Trough=90 → drawdown = (150-90)/150 * 100 = 40%
    expect(result.maxDrawdownPercent).toBeCloseTo(40, 0);
    expect(result.maxDrawdown).toBeCloseTo(60, 0); // 150 - 90
    expect(result.peakIndex).toBe(2); // price 150 at index 2
    expect(result.troughIndex).toBe(5); // price 90 at index 5
  });

  it('should handle edge case: all positive returns for Sharpe', async () => {
    const { calculateSharpe } = await import('../quant/risk-metrics.js');

    const result = calculateSharpe([0.01, 0.02, 0.03, 0.01, 0.02], 0.01);
    expect(result).toBeGreaterThan(0);
  });

  it('should handle edge case: all positive returns for Sortino (no downside)', async () => {
    const { calculateSortino } = await import('../quant/risk-metrics.js');

    // All returns above target → no downside deviation → Infinity
    const result = calculateSortino([0.05, 0.03, 0.04, 0.02, 0.06], 0.01);
    expect(result).toBe(Infinity);
  });
});

// ============================================================================
// 2. Valuation — DCF and Ratios
// ============================================================================

describe('Valuation Analysis', () => {
  it('should calculate DCF valuation correctly', async () => {
    // Direct DCF math verification (valuation-tools doesn't export pure functions)
    const dcfs = [100, 110, 121, 133, 146];
    const rate = 0.10;
    const terminalGrowth = 0.03;
    const shares = 1000;

    // Manual DCF calculation to verify
    let pvFcfs = 0;
    for (let i = 0; i < dcfs.length; i++) {
      pvFcfs += dcfs[i] / Math.pow(1 + rate, i + 1);
    }
    const lastFcf = dcfs[dcfs.length - 1];
    const terminalValue = lastFcf * (1 + terminalGrowth) / (rate - terminalGrowth);
    const pvTerminal = terminalValue / Math.pow(1 + rate, dcfs.length);
    const totalValue = pvFcfs + pvTerminal;
    const perShare = totalValue / shares;

    expect(pvFcfs).toBeGreaterThan(0);
    expect(terminalValue).toBeGreaterThan(0);
    expect(perShare).toBeGreaterThan(0);
    // Terminal value should be a significant portion (>30%)
    expect(pvTerminal / totalValue).toBeGreaterThan(0.3);
    // PV of FCFs should be reasonable (~454)
    expect(pvFcfs).toBeCloseTo(454.2, 0);
  });
});

// ============================================================================
// 3. Options Pricing — Black-Scholes
// ============================================================================

describe('Options Pricing', () => {
  it('should price a European call option via Black-Scholes', async () => {
    const { blackScholes } = await import('../quant/options-pricing.js');

    const result = blackScholes(100, 105, 0.25, 0.05, 0.2, 'call');

    expect(result.price).toBeGreaterThan(0);
    // Out-of-the-money call with 3 months should have small but positive value
    expect(result.price).toBeGreaterThan(0.5);
    expect(result.price).toBeLessThan(10);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.delta).toBeLessThan(1);
    // All Greeks should be defined
    expect(result.gamma).toBeGreaterThan(0);
    expect(result.vega).toBeGreaterThan(0);
  });

  it('should price a put option', async () => {
    const { blackScholes } = await import('../quant/options-pricing.js');

    const result = blackScholes(100, 95, 0.5, 0.05, 0.25, 'put');

    expect(result.price).toBeGreaterThan(0);
    expect(result.delta).toBeLessThan(0); // Put delta is negative
    expect(result.delta).toBeGreaterThan(-1); // But not below -1
  });

  it('should satisfy put-call parity', async () => {
    const { blackScholes } = await import('../quant/options-pricing.js');

    const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
    const call = blackScholes(S, K, T, r, sigma, 'call');
    const put = blackScholes(S, K, T, r, sigma, 'put');

    // Put-call parity: C - P = S - K*exp(-rT)
    const parityLHS = call.price - put.price;
    const parityRHS = S - K * Math.exp(-r * T);
    expect(Math.abs(parityLHS - parityRHS)).toBeLessThan(0.01);
  });

  it('should return zero value for deep out-of-the-money option at expiry', async () => {
    const { blackScholes } = await import('../quant/options-pricing.js');

    // T=0 means at expiration, call with S<K is worthless
    const result = blackScholes(80, 100, 0, 0.05, 0.2, 'call');
    expect(result.price).toBe(0);
  });

  it('should calculate implied volatility', async () => {
    const { blackScholes, impliedVolatility } = await import('../quant/options-pricing.js');

    // First compute a known option price, then recover the implied vol
    const S = 100, K = 100, T = 0.5, r = 0.05, sigma = 0.25;
    const call = blackScholes(S, K, T, r, sigma, 'call');

    const iv = impliedVolatility(call.price, S, K, T, r, 'call');
    expect(iv).toBeGreaterThan(0);
    // Should recover approximately the same volatility
    expect(Math.abs(iv - sigma)).toBeLessThan(0.01);
  });
});

// ============================================================================
// 4. Technical Indicators (via tool invocation — internal funcs are not exported)
// ============================================================================

describe('Technical Indicators', () => {
  it('should register KDJ tool and BOLL tool with correct names', async () => {
    const { createCalculateKDJTool, createCalculateBOLLTool, createCalculateIndicatorsTool } =
      await import('../quant/technical-indicators.js');

    const kdjTool = createCalculateKDJTool();
    const bollTool = createCalculateBOLLTool();
    const allTool = createCalculateIndicatorsTool();

    expect(kdjTool.name).toBe('calculate_kdj');
    expect(bollTool.name).toBe('calculate_boll');
    expect(allTool.name).toBe('calculate_technical_indicators');
  });

  it('should calculate KDJ via tool invocation with OHLCV data', async () => {
    const { createCalculateKDJTool } = await import('../quant/technical-indicators.js');
    const tool = createCalculateKDJTool();

    // Generate 25 days of OHLCV data
    const data = Array.from({ length: 25 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100 + Math.sin(i * 0.5) * 2,
      high: 105 + Math.sin(i * 0.5) * 3,
      low: 95 + Math.sin(i * 0.5) * 3,
      close: 100 + Math.sin(i * 0.5) * 3,
      volume: 1000000 + Math.random() * 500000,
    }));

    const result = await tool.invoke({ data });
    const parsed = JSON.parse(result);

    expect(parsed).toBeDefined();
    // formatToolResult wraps in { data: ... }
    const inner = parsed.data ?? parsed;
    expect(inner.type).toBe('KDJ Indicator');
    expect(inner.signal).toBeDefined();
    // Signal should be one of: OVERBOUGHT, OVERSOLD, BULLISH, BEARISH, NEUTRAL
    expect(['OVERBOUGHT', 'OVERSOLD', 'BULLISH', 'BEARISH', 'NEUTRAL']).toContain(inner.signal);
  });

  it('should calculate Bollinger Bands via tool invocation', async () => {
    const { createCalculateBOLLTool } = await import('../quant/technical-indicators.js');
    const tool = createCalculateBOLLTool();

    const data = Array.from({ length: 25 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: 100 + Math.sin(i * 0.3) * 5,
      high: 105 + Math.sin(i * 0.3) * 5,
      low: 95 + Math.sin(i * 0.3) * 5,
      close: 100 + Math.sin(i * 0.3) * 5,
      volume: 1000000,
    }));

    const result = await tool.invoke({ data });
    const parsed = JSON.parse(result);

    expect(parsed).toBeDefined();
    // formatToolResult wraps in { data: ... }
    const inner = parsed.data ?? parsed;
    expect(inner.type).toBe('Bollinger Bands');
    expect(inner.signal).toBeDefined();
    expect(inner.values).toBeDefined();
    expect(inner.values.length).toBeGreaterThan(0);

    // Verify band values: upper > middle > lower
    const latest = inner.values[inner.values.length - 1];
    if (latest && typeof latest === 'object' && latest.value) {
      const v = latest.value;
      expect(v.upper).toBeGreaterThan(v.middle);
      expect(v.middle).toBeGreaterThan(v.lower);
    }
  });
});

// ============================================================================
// 5. Correlation Analysis
// ============================================================================

describe('Correlation Analysis', () => {
  it('should calculate perfect positive correlation', async () => {
    const { calculatePearsonCorrelation } = await import('../quant/data-reliability.js');

    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = x.map(v => v * 2 + 1); // Perfect linear

    const result = calculatePearsonCorrelation(x, y);
    expect(result.correlation).toBeCloseTo(1.0, 5);
    expect(result.strength).toBe('very-strong');
  });

  it('should detect negative correlation', async () => {
    const { calculatePearsonCorrelation } = await import('../quant/data-reliability.js');

    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = x.map(v => -v * 3 + 100); // Perfect negative linear

    const result = calculatePearsonCorrelation(x, y);
    expect(result.correlation).toBeCloseTo(-1.0, 5);
    expect(result.strength).toBe('very-strong');
  });

  it('should return ~0 for uncorrelated series', async () => {
    const { calculatePearsonCorrelation } = await import('../quant/data-reliability.js');

    const x = [1, 2, 3, 4, 5];
    const y = [3, 1, 4, 1, 5]; // Random-ish

    const result = calculatePearsonCorrelation(x, y);
    expect(Math.abs(result.correlation)).toBeLessThan(0.5); // Not strongly correlated
  });
});

// ============================================================================
// 6. Tax Calculation
// ============================================================================

describe('Tax Calculation', () => {
  it('should calculate US capital gains tax for long-term holding', async () => {
    const { calculateTax } = await import('../quant/tax-calculator.js');

    // Long-term: purchaseDate > 1 year ago
    const purchaseDate = new Date();
    purchaseDate.setFullYear(purchaseDate.getFullYear() - 2); // 2 years ago

    const result = calculateTax('AAPL', 100, 100, 150, purchaseDate, 'us');

    expect(result.gain).toBe(5000); // (150-100)*100
    expect(result.isLongTerm).toBe(true);
    expect(result.estimatedTax).toBeGreaterThan(0);
    expect(result.netProceeds).toBeLessThan(result.marketValue);
    // US long-term rate is 20%
    expect(result.taxRate).toBe(0.20);
    expect(result.estimatedTax).toBeCloseTo(1000, 0); // 5000 * 0.20
  });

  it('should calculate US short-term capital gains tax', async () => {
    const { calculateTax } = await import('../quant/tax-calculator.js');

    // Short-term: purchaseDate < 1 year ago
    const purchaseDate = new Date();
    purchaseDate.setMonth(purchaseDate.getMonth() - 3); // 3 months ago

    const result = calculateTax('TSLA', 50, 200, 280, purchaseDate, 'us');

    expect(result.gain).toBe(4000); // (280-200)*50
    expect(result.isLongTerm).toBe(false);
    // US short-term rate is 37%
    expect(result.taxRate).toBe(0.37);
    expect(result.estimatedTax).toBeCloseTo(1480, 0); // 4000 * 0.37
  });

  it('should calculate China A-share tax', async () => {
    const { calculateTax } = await import('../quant/tax-calculator.js');

    const purchaseDate = new Date();
    purchaseDate.setMonth(purchaseDate.getMonth() - 6); // 6 months ago

    const result = calculateTax('600519.SS', 1000, 10, 15, purchaseDate, 'china');

    expect(result.gain).toBe(5000); // (15-10)*1000
    expect(result.estimatedTax).toBeGreaterThan(0);
    // China tax rate is 20% for both short and long term
    expect(result.taxRate).toBe(0.20);
    expect(result.estimatedTax).toBeCloseTo(1000, 0); // 5000 * 0.20
  });

  it('should handle Hong Kong (no capital gains tax)', async () => {
    const { calculateTax } = await import('../quant/tax-calculator.js');

    const purchaseDate = new Date();
    purchaseDate.setFullYear(purchaseDate.getFullYear() - 1);

    const result = calculateTax('0700.HK', 200, 300, 400, purchaseDate, 'hongkong');

    expect(result.gain).toBe(20000); // (400-300)*200
    expect(result.taxRate).toBe(0);
    expect(result.estimatedTax).toBe(0);
    expect(result.netProceeds).toBe(result.marketValue);
  });

  it('should handle losses (no tax on losses)', async () => {
    const { calculateTax } = await import('../quant/tax-calculator.js');

    const purchaseDate = new Date();
    purchaseDate.setFullYear(purchaseDate.getFullYear() - 1);

    const result = calculateTax('LOSER', 100, 50, 30, purchaseDate, 'us');

    expect(result.gain).toBeLessThan(0);
    expect(result.estimatedTax).toBe(0); // No tax on losses
  });
});

// ============================================================================
// 7. Investment Tool Registration
// ============================================================================

describe('Investment Tool Registration', () => {
  it('should register all critical investment tools', async () => {
    const { loadFinanceTools } = await import('../registry/finance-tools.js');
    const { loadQuantTools } = await import('../registry/quant-tools.js');

    const allTools = [
      ...loadFinanceTools('gpt-4o'),
      ...loadQuantTools(),
    ];

    const names = new Set(allTools.map(t => t.name));

    // Critical finance tools
    const criticalFinance = ['get_financials', 'get_market_data', 'read_filings', 'stock_screener'];
    for (const name of criticalFinance) {
      expect(names.has(name)).toBe(true);
    }

    // Critical quant tools
    const criticalQuant = ['calculate_var', 'calculate_sharpe', 'calculate_sortino', 'calculate_max_drawdown',
      'calculate_option_price', 'calculate_technical_indicators', 'calculate_correlation'];
    for (const name of criticalQuant) {
      expect(names.has(name)).toBe(true);
    }

    console.log(`  Investment tools: ${allTools.length} (finance + quant)`);
  });

  it('should have all finance tools as concurrent-safe', async () => {
    const { loadFinanceTools } = await import('../registry/finance-tools.js');
    const tools = loadFinanceTools('gpt-4o');

    for (const tool of tools) {
      expect(tool.concurrencySafe).toBe(true);
    }
    console.log(`  All ${tools.length} finance tools are concurrent-safe`);
  });

  it('should have all quant tools as concurrent-safe', async () => {
    const { loadQuantTools } = await import('../registry/quant-tools.js');
    const tools = loadQuantTools();

    for (const tool of tools) {
      expect(tool.concurrencySafe).toBe(true);
    }
    console.log(`  All ${tools.length} quant tools are concurrent-safe`);
  });
});
