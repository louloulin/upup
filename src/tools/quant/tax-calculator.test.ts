/**
 * Tax Calculator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTax,
  createCalculateTaxTool,
  createCalculateTradesTaxTool,
  createCalculatePnLTool,
} from './tax-calculator.js';

describe('calculateTax', () => {
  it('calculates short-term US tax correctly', () => {
    // Bought 100 shares at $50, now at $60, held for 30 days (short-term)
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
    const result = calculateTax('AAPL', 100, 50, 60, oneMonthAgo, 'us');

    expect(result.costBasis).toBe(5000);
    expect(result.marketValue).toBe(6000);
    expect(result.gain).toBe(1000);
    expect(result.isLongTerm).toBe(false);
    expect(result.taxRate).toBe(0.37); // Short-term rate
    expect(result.estimatedTax).toBe(370); // 1000 * 0.37
  });

  it('calculates long-term US tax correctly', () => {
    // Bought 100 shares at $50, now at $70, held for 400 days (long-term)
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 400);
    const result = calculateTax('MSFT', 100, 50, 70, longAgo, 'us');

    expect(result.gain).toBe(2000);
    expect(result.isLongTerm).toBe(true);
    expect(result.taxRate).toBe(0.20); // Long-term rate
    expect(result.estimatedTax).toBe(400); // 2000 * 0.20
  });

  it('calculates China tax correctly', () => {
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 400);
    const result = calculateTax('600519', 1000, 100, 150, longAgo, 'china');

    expect(result.taxRate).toBe(0.20); // China flat rate
    expect(result.isLongTerm).toBe(true); // More than 1 year
    expect(result.estimatedTax).toBe(10000); // 50000 gain * 0.20
  });

  it('calculates Hong Kong tax as zero', () => {
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 400);
    const result = calculateTax('0700.HK', 100, 200, 250, longAgo, 'hongkong');

    expect(result.taxRate).toBe(0);
    expect(result.estimatedTax).toBe(0);
  });

  it('handles loss correctly (no tax on loss)', () => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
    const result = calculateTax('TSLA', 100, 100, 80, oneMonthAgo, 'us');

    expect(result.gain).toBe(-2000); // Loss
    expect(result.estimatedTax).toBe(0); // No tax on loss
    expect(result.netProceeds).toBe(8000);
  });

  it('calculates holding period correctly', () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const result = calculateTax('NVDA', 50, 100, 150, sixMonthsAgo, 'us');

    expect(result.holdingPeriod).toBeGreaterThan(150);
    expect(result.holdingPeriod).toBeLessThan(200);
    expect(result.isLongTerm).toBe(false);
  });
});

describe('Tax Tool Creation', () => {
  const taxTool = createCalculateTaxTool();
  const tradesTaxTool = createCalculateTradesTaxTool();
  const pnlTool = createCalculatePnLTool();

  it('createCalculateTaxTool has correct name', () => {
    expect(taxTool.name).toBe('calculate_capital_gains_tax');
  });

  it('createCalculateTradesTaxTool has correct name', () => {
    expect(tradesTaxTool.name).toBe('calculate_trades_tax');
  });

  it('createCalculatePnLTool has correct name', () => {
    expect(pnlTool.name).toBe('calculate_pnl');
  });

  it('tax tool accepts required parameters', async () => {
    const result = await taxTool.invoke({
      symbol: 'AAPL',
      quantity: 100,
      purchasePrice: 150,
      currentPrice: 175,
      purchaseDate: '2025-01-15',
      jurisdiction: 'us',
    });
    expect(result).toBeDefined();
    expect(result).toContain('AAPL');
  });

  it('pnl tool handles single trade', async () => {
    const result = await pnlTool.invoke({
      trades: [{
        symbol: 'AAPL',
        quantity: 100,
        purchasePrice: 150,
        sellPrice: 175,
      }],
    });
    expect(result).toBeDefined();
    expect(result).toContain('AAPL');
    expect(result).toContain('+'); // Profit
  });

  it('pnl tool handles losing trade', async () => {
    const result = await pnlTool.invoke({
      trades: [{
        symbol: 'TSLA',
        quantity: 50,
        purchasePrice: 200,
        sellPrice: 150,
      }],
    });
    expect(result).toBeDefined();
    expect(result).toContain('TSLA');
  });
});

describe('Tax Edge Cases', () => {
  it('handles zero quantity', () => {
    const result = calculateTax('AAPL', 0, 100, 150, new Date('2025-01-01'), 'us');
    expect(result.gain).toBe(0);
    expect(result.estimatedTax).toBe(0);
  });

  it('handles breakeven', () => {
    const result = calculateTax('AAPL', 100, 100, 100, new Date('2025-01-01'), 'us');
    expect(result.gain).toBe(0);
    expect(result.estimatedTax).toBe(0);
  });

  it('calculates percentages correctly', () => {
    const result = calculateTax('AAPL', 100, 100, 150, new Date('2025-01-01'), 'us');
    expect(result.gainPercent).toBe(50);
  });
});
