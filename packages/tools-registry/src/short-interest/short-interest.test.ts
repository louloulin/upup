/**
 * Short Interest Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  createGetShortInterestTool,
  createCalculateShortInterestRatioTool,
  createDetectShortSqueezeTool,
} from './short-interest.js';

describe('get_short_interest', () => {
  const tool = createGetShortInterestTool();

  it('returns short interest data', async () => {
    const result = await tool.invoke({
      symbol: 'AAPL',
      includeSqueezeAnalysis: true,
    });
    
    expect(result).toBeDefined();
    expect(result).toContain('AAPL');
    expect(result).toContain('shortInterest');
    expect(result).toContain('daysToCover');
  });

  it('includes squeeze analysis when enabled', async () => {
    const result = await tool.invoke({
      symbol: 'TSLA',
      includeSqueezeAnalysis: true,
    });
    
    expect(result).toContain('squeezeAnalysis');
    expect(result).toContain('score');
    expect(result).toContain('riskLevel');
  });

  it('works without squeeze analysis', async () => {
    const result = await tool.invoke({
      symbol: 'MSFT',
      includeSqueezeAnalysis: false,
    });
    
    expect(result).toContain('MSFT');
    expect(result).toContain('shortInterest');
  });

  it('handles lowercase symbols', async () => {
    const result = await tool.invoke({
      symbol: 'googl',
      includeSqueezeAnalysis: true,
    });
    
    expect(result).toContain('GOOGL');
  });
});

describe('calculate_short_interest_ratio', () => {
  const tool = createCalculateShortInterestRatioTool();

  it('returns market short interest', async () => {
    const result = await tool.invoke({
      symbol: 'GME',
    });
    
    expect(result).toBeDefined();
    expect(result).toContain('GME');
    expect(result).toContain('daysToCover');
  });

  it('includes position analysis when provided', async () => {
    const result = await tool.invoke({
      symbol: 'AMC',
      quantity: 100,
      avgCost: 50,
    });
    
    expect(result).toContain('positionAnalysis');
    expect(result).toContain('positionValue');
  });
});

describe('detect_short_squeeze', () => {
  const tool = createDetectShortSqueezeTool();

  it('screens multiple symbols', async () => {
    const result = await tool.invoke({
      symbols: ['AAPL', 'TSLA', 'GME', 'AMC', 'NVDA'],
      minShortInterestRatio: 1,
      minShortPercentFloat: 1,
    });
    
    expect(result).toBeDefined();
    expect(result).toContain('highRiskStocks');
    expect(result).toContain('mediumRiskStocks');
    expect(result).toContain('screeningCriteria');
  });

  it('returns sorted results', async () => {
    const result = await tool.invoke({
      symbols: ['GME', 'AMC', 'BBBY'],
      minShortInterestRatio: 5,
      minShortPercentFloat: 5,
    });
    
    expect(result).toContain('allMatches');
  });

  it('handles single symbol', async () => {
    const result = await tool.invoke({
      symbols: ['TSLA'],
      minShortInterestRatio: 3,
      minShortPercentFloat: 3,
    });
    
    expect(result).toContain('symbolsScreened');
  });

  it('respects minimum criteria', async () => {
    const result = await tool.invoke({
      symbols: ['AAPL', 'MSFT'],
      minShortInterestRatio: 30, // Very high threshold
      minShortPercentFloat: 30,
    });
    
    expect(result).toContain('matchesFound');
  });
});

describe('Short Interest Calculations', () => {
  it('days to cover calculation', async () => {
    const tool = createCalculateShortInterestRatioTool();
    const result = await tool.invoke({
      symbol: 'TEST',
    });
    
    expect(result).toContain('daysToCover');
    // Should be a number string like "X.X"
    expect(result).toMatch(/\d+\.\d+/);
  });

  it('borrow cost is included', async () => {
    const tool = createGetShortInterestTool();
    const result = await tool.invoke({
      symbol: 'TEST',
      includeSqueezeAnalysis: true,
    });
    
    expect(result).toContain('borrowCost');
  });
});
