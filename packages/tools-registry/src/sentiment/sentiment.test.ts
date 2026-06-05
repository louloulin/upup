/**
 * Unit tests for Sentiment Analysis Tool
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { createGetSentiment } from './index';

describe('Sentiment Analysis Tool', () => {
  const mockModel = 'test-model';
  let tool: any;

  beforeEach(() => {
    tool = createGetSentiment(mockModel);
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('get_sentiment');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('get_sentiment');
    expect(tool.description).toContain('sentiment');
  });

  test('should have schema with code optional', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.code).toBeDefined();
    expect(tool.schema.shape.code.isOptional()).toBe(true);
  });

  test('should have schema with period enum', () => {
    expect(tool.schema.shape.period).toBeDefined();
    const period = tool.schema.shape.period;
    expect(period._def.openapi?.format).toBeUndefined(); // Zod enum
  });

  test('should have schema with sentiment_type enum', () => {
    expect(tool.schema.shape.sentiment_type).toBeDefined();
  });

  test('should handle missing TUSHARE_TOKEN gracefully', async () => {
    // Mock environment without TUSHARE_TOKEN
    const originalToken = process.env.TUSHARE_TOKEN;
    delete process.env.TUSHARE_TOKEN;

    try {
      const result = await tool.invoke({
        code: '600519.SH',
        period: '1w',
      });
      
      const parsed = JSON.parse(result);
      expect(parsed.error || parsed.source).toBeDefined();
    } finally {
      if (originalToken) {
        process.env.TUSHARE_TOKEN = originalToken;
      }
    }
  });
});
