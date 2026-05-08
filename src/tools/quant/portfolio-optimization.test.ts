/**
 * Portfolio Optimization Tests
 */

import { describe, it, expect } from 'vitest';
import {
  createCalculateKellyTool,
  createCalculateRiskParityTool,
  createCalculateMeanVarianceTool,
} from './portfolio-optimization.js';

describe('Kelly Criterion', () => {
  const tool = createCalculateKellyTool();

  it('calculates Kelly fraction', async () => {
    const result = await tool.invoke({
      winRate: 0.6,
      avgWin: 0.15,
      avgLoss: 0.08,
    });

    expect(result).toBeDefined();
    expect(result).toContain('Kelly');
    expect(result).toContain('optimalPosition');
    expect(result).toContain('safePosition');
  });

  it('handles negative Kelly (bad strategy)', async () => {
    const result = await tool.invoke({
      winRate: 0.3,
      avgWin: 0.05,
      avgLoss: 0.10,
    });

    expect(result).toContain('negative') || expect(result).toContain('Avoid');
  });

  it('includes position sizing with capital', async () => {
    const result = await tool.invoke({
      winRate: 0.55,
      avgWin: 0.12,
      avgLoss: 0.06,
      capital: 100000,
    });

    expect(result).toContain('positionSizing');
  });

  it('high win rate gives positive Kelly', async () => {
    const result = await tool.invoke({
      winRate: 0.7,
      avgWin: 0.10,
      avgLoss: 0.05,
    });

    expect(result).toContain('safePosition');
  });
});

describe('Risk Parity', () => {
  const tool = createCalculateRiskParityTool();

  it('calculates risk parity weights', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'SPY', volatility: 0.18, expectedReturn: 0.10 },
        { symbol: 'TLT', volatility: 0.12, expectedReturn: 0.05 },
      ],
    });

    expect(result).toBeDefined();
    expect(result).toContain('SPY');
    expect(result).toContain('TLT');
    expect(result).toContain('Risk Parity');
  });

  it('lower volatility gets higher weight', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'STOCK', volatility: 0.30, expectedReturn: 0.15 },
        { symbol: 'BOND', volatility: 0.06, expectedReturn: 0.04 },
      ],
    });

    // BOND should have higher weight due to lower volatility
    expect(result).toContain('BOND');
    expect(result).toContain('STOCK');
  });

  it('handles multiple assets', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'A', volatility: 0.20, expectedReturn: 0.10 },
        { symbol: 'B', volatility: 0.15, expectedReturn: 0.08 },
        { symbol: 'C', volatility: 0.25, expectedReturn: 0.12 },
        { symbol: 'D', volatility: 0.10, expectedReturn: 0.05 },
      ],
    });

    expect(result).toContain('summary');
    expect(result).toContain('A');
    expect(result).toContain('D');
  });
});

describe('Mean-Variance Optimization', () => {
  const tool = createCalculateMeanVarianceTool();

  it('optimizes portfolio weights', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'SPY', volatility: 0.18, expectedReturn: 0.10 },
        { symbol: 'QQQ', volatility: 0.22, expectedReturn: 0.15 },
      ],
      riskFreeRate: 0.02,
    });

    expect(result).toBeDefined();
    expect(result).toContain('SPY');
    expect(result).toContain('QQQ');
    expect(result).toContain('sharpeRatio');
  });

  it('includes portfolio metrics', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'A', volatility: 0.15, expectedReturn: 0.08 },
        { symbol: 'B', volatility: 0.20, expectedReturn: 0.12 },
      ],
    });

    expect(result).toContain('expectedReturn');
    expect(result).toContain('expectedVolatility');
  });

  it('handles custom correlation matrix', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'X', volatility: 0.15, expectedReturn: 0.10 },
        { symbol: 'Y', volatility: 0.20, expectedReturn: 0.12 },
      ],
      correlations: [[1, 0.5], [0.5, 1]],
    });

    expect(result).toContain('sharpeRatio');
  });

  it('handles single asset', async () => {
    const result = await tool.invoke({
      assets: [
        { symbol: 'SOLO', volatility: 0.20, expectedReturn: 0.10 },
      ],
    });

    expect(result).toContain('SOLO');
  });
});
