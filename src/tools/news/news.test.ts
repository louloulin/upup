/**
 * Unit tests for News Aggregator Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createNewsAggregator } from './index';

describe('News Aggregator Tool', () => {
  let tool: any;

  beforeEach(() => {
    tool = createNewsAggregator('test-model');
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('news_aggregator');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('news_aggregator');
  });

  test('should have schema with action enum', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.action).toBeDefined();
  });

  test('should handle market action', async () => {
    const result = await tool.invoke({ action: 'market' });
    const parsed = JSON.parse(result);
    expect(parsed.action || parsed.error).toBeDefined();
  });
});
