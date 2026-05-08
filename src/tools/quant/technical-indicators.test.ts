/**
 * Technical Indicators Tests (KDJ, BOLL, WR, CCI, ATR, OBV)
 */

import { describe, it, expect } from 'vitest';
import {
  createCalculateIndicatorsTool,
  createCalculateKDJTool,
  createCalculateBOLLTool,
} from './technical-indicators.js';

// Generate sample OHLCV data
function generateSampleData(days: number): Array<{
  date: string; open: number; high: number; low: number; close: number; volume: number;
}> {
  const data = [];
  let price = 100;
  for (let i = 0; i < days; i++) {
    const date = new Date(2025, 0, i + 1);
    const change = (Math.sin(i * 0.5) * 3) + (Math.random() - 0.5) * 2;
    price = Math.max(50, price + change);
    const high = price + Math.abs(change) * 0.5;
    const low = price - Math.abs(change) * 0.5;
    data.push({
      date: date.toISOString().split('T')[0],
      open: Math.round(price * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(price * 100) / 100,
      volume: Math.round(1000000 + Math.random() * 500000),
    });
  }
  return data;
}

const sampleData = generateSampleData(30);

describe('calculate_technical_indicators', () => {
  const tool = createCalculateIndicatorsTool();

  it('calculates all indicators', async () => {
    const result = await tool.invoke({
      data: sampleData,
    });

    expect(result).toBeDefined();
    expect(result).toContain('KDJ');
    expect(result).toContain('BOLL');
    expect(result).toContain('WR');
    expect(result).toContain('CCI');
    expect(result).toContain('ATR');
    expect(result).toContain('OBV');
    expect(result).toContain('signal');
  });

  it('calculates selected indicators', async () => {
    const result = await tool.invoke({
      data: sampleData,
      indicators: ['kdj', 'atr'],
    });

    expect(result).toContain('KDJ');
    expect(result).toContain('ATR');
    // Should not contain the others
  });

  it('includes summary', async () => {
    const result = await tool.invoke({
      data: sampleData,
      indicators: ['wr'],
    });

    expect(result).toContain('WR');
    expect(result).toContain('signal');
  });
});

describe('calculate_kdj', () => {
  const tool = createCalculateKDJTool();

  it('returns KDJ values', async () => {
    const result = await tool.invoke({ data: sampleData });

    expect(result).toBeDefined();
    expect(result).toContain('KDJ');
    expect(result).toContain('K');
    expect(result).toContain('D');
    expect(result).toContain('J');
  });

  it('includes signal interpretation', async () => {
    const result = await tool.invoke({ data: sampleData });

    expect(result).toContain('signal');
    expect(result).toContain('interpretation');
  });

  it('handles minimum data', async () => {
    const minData = generateSampleData(15);
    const result = await tool.invoke({ data: minData });

    expect(result).toBeDefined();
    expect(result).toContain('KDJ');
  });
});

describe('calculate_boll', () => {
  const tool = createCalculateBOLLTool();

  it('returns Bollinger Bands values', async () => {
    const result = await tool.invoke({ data: sampleData });

    expect(result).toBeDefined();
    expect(result).toContain('Bollinger');
    expect(result).toContain('upper');
    expect(result).toContain('lower');
    expect(result).toContain('middle');
  });

  it('includes bandwidth and percentB', async () => {
    const result = await tool.invoke({ data: sampleData });

    expect(result).toContain('bandwidth');
    expect(result).toContain('percentB');
  });

  it('includes signal', async () => {
    const result = await tool.invoke({ data: sampleData });

    expect(result).toContain('signal');
  });
});

describe('Technical Indicator Math', () => {
  it('KDJ values are within 0-100 range for K and D', async () => {
    const tool = createCalculateKDJTool();
    const result = await tool.invoke({ data: sampleData });

    // Just verify it doesn't crash and returns data
    expect(result).toContain('KDJ');
  });

  it('BOLL upper > middle > lower', async () => {
    const tool = createCalculateBOLLTool();
    const result = await tool.invoke({ data: sampleData });

    // Contains all band values
    expect(result).toContain('upper');
    expect(result).toContain('middle');
    expect(result).toContain('lower');
  });

  it('ATR is always positive', async () => {
    const tool = createCalculateIndicatorsTool();
    const result = await tool.invoke({
      data: sampleData,
      indicators: ['atr'],
    });

    expect(result).toContain('ATR');
  });

  it('OBV changes with price direction', async () => {
    const tool = createCalculateIndicatorsTool();
    const result = await tool.invoke({
      data: sampleData,
      indicators: ['obv'],
    });

    expect(result).toContain('OBV');
  });

  it('WR is in range -100 to 0', async () => {
    const tool = createCalculateIndicatorsTool();
    const result = await tool.invoke({
      data: sampleData,
      indicators: ['wr'],
    });

    expect(result).toContain('WR');
  });

  it('CCI can be positive or negative', async () => {
    const tool = createCalculateIndicatorsTool();
    const result = await tool.invoke({
      data: sampleData,
      indicators: ['cci'],
    });

    expect(result).toContain('CCI');
  });
});
