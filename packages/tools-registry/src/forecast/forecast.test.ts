/**
 * Unit tests for Financial Forecast Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createFinancialForecast } from './index';

describe('Financial Forecast Tool', () => {
  const mockModel = 'test-model';
  let tool: any;

  beforeEach(() => {
    tool = createFinancialForecast(mockModel);
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('financial_forecast');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('financial_forecast');
    expect(tool.description).toContain('forecast');
  });

  test('should have schema with required code', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.code).toBeDefined();
  });

  test('should have schema with optional forecast_period', () => {
    expect(tool.schema.shape.forecast_period).toBeDefined();
    expect(tool.schema.shape.forecast_period.isOptional()).toBe(true);
  });

  test('should have schema with optional metrics', () => {
    expect(tool.schema.shape.metrics).toBeDefined();
    expect(tool.schema.shape.metrics.isOptional()).toBe(true);
  });

  test('should handle missing TUSHARE_TOKEN', async () => {
    const originalToken = process.env.TUSHARE_TOKEN;
    delete process.env.TUSHARE_TOKEN;

    try {
      const result = await tool.invoke({
        code: '600519.SH',
      });
      
      const parsed = JSON.parse(result);
      expect(parsed.source).toBe('tushare');
    } finally {
      if (originalToken) {
        process.env.TUSHARE_TOKEN = originalToken;
      }
    }
  });
});
