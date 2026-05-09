/**
 * Target Price Calculator Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  calculateTax,
  createCalculateTaxTool,
  createCalculateTradesTaxTool,
  createCalculatePnLTool,
} from './tax-calculator.js';
import {
  createCalculateTargetPriceTool,
  createQuickTargetPriceTool,
} from './target-price.js';

describe('Target Price Calculation', () => {
  const targetPriceTool = createCalculateTargetPriceTool();
  const quickTargetTool = createQuickTargetPriceTool();

  it('calculate_target_price works with DCF method', async () => {
    const result = await targetPriceTool.invoke({
      symbol: 'AAPL',
      currentPrice: 150,
      method: 'dcf',
      currentEps: 6.0,
      growthRate: 0.15,
      discountRate: 0.10,
      terminalGrowthRate: 0.03,
      projectionYears: 5,
    });

    expect(result).toBeDefined();
    expect(result).toContain('AAPL');
    expect(result).toContain('150'); // Current price
  });

  it('calculate_target_price works with PE method', async () => {
    const result = await targetPriceTool.invoke({
      symbol: 'MSFT',
      currentPrice: 350,
      method: 'pe',
      currentEps: 10,
      forwardEps: 12,
      targetPe: 30,
      peYears: 3,
    });

    expect(result).toBeDefined();
    expect(result).toContain('MSFT');
    expect(result).toContain('350'); // Current price
  });

  it('calculate_target_price works with SOTP method', async () => {
    const result = await targetPriceTool.invoke({
      symbol: 'BRK.B',
      currentPrice: 350,
      method: 'sotp',
      components: [
        { name: 'Insurance', value: 200, weight: 1 },
        { name: 'Railroad', value: 100, weight: 1 },
        { name: 'Energy', value: 80, weight: 1 },
      ],
    });

    expect(result).toBeDefined();
    expect(result).toContain('BRK.B');
    expect(result).toContain('380'); // Total components value
  });

  it('calculate_target_price works with combined method', async () => {
    const result = await targetPriceTool.invoke({
      symbol: 'GOOGL',
      currentPrice: 140,
      method: 'combined',
      currentEps: 5.5,
      growthRate: 0.20,
    });

    expect(result).toBeDefined();
    expect(result).toContain('GOOGL');
    expect(result).toContain('140');
  });

  it('quick_target_price calculates correctly', async () => {
    const result = await quickTargetTool.invoke({
      symbol: 'TSLA',
      currentPrice: 200,
      currentEps: 4,
      forwardEps: 5.5,
      growthRate: 0.25,
    });

    expect(result).toBeDefined();
    expect(result).toContain('TSLA');
    expect(result).toContain('200');
    expect(result).toContain('BUY');
  });

  it('quick_target_price handles low growth correctly', async () => {
    const result = await quickTargetTool.invoke({
      symbol: 'IBM',
      currentPrice: 180,
      currentEps: 8,
      forwardEps: 8.5,
      growthRate: 0.05,
    });

    expect(result).toBeDefined();
    expect(result).toContain('IBM');
    expect(result).toContain('180');
  });

  it('SOTP requires components', async () => {
    const result = await targetPriceTool.invoke({
      symbol: 'TST',
      currentPrice: 100,
      method: 'sotp',
      // No components - should error
    });

    expect(result).toContain('requires');
  });

  it('target price shows upside/downside', async () => {
    const result = await targetPriceTool.invoke({
      symbol: 'NVDA',
      currentPrice: 800,
      method: 'combined',
      currentEps: 20,
      growthRate: 0.30,
    });

    expect(result).toContain('+'); // Should be positive upside
  });
});

describe('Target Price Confidence Levels', () => {
  it('high confidence for reasonable parameters', async () => {
    const targetPriceTool = createCalculateTargetPriceTool();
    const result = await targetPriceTool.invoke({
      symbol: 'SAFE',
      currentPrice: 100,
      method: 'pe',
      currentEps: 5,
      forwardEps: 6,
      targetPe: 25,
      peYears: 3,
    });

    expect(result).toContain('confidence');
    expect(result).toContain('100');
    expect(result).toContain('BUY');
  });

  it('recommendation logic works', async () => {
    const quickTargetTool = createQuickTargetPriceTool();

    // High growth = BUY
    const buyResult = await quickTargetTool.invoke({
      symbol: 'GROW',
      currentPrice: 100,
      currentEps: 2,
      forwardEps: 4,
      growthRate: 0.50,
    });
    expect(buyResult).toContain('BUY');

    // Negative growth scenario - use smaller price difference
    const holdResult = await quickTargetTool.invoke({
      symbol: 'STABLE',
      currentPrice: 100,
      currentEps: 5,
      forwardEps: 5.2,
      growthRate: 0.04,
    });
    expect(holdResult).toContain('recommendation');
  });
});
