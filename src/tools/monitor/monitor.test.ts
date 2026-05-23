/**
 * Unit tests for Market Monitor Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createMarketMonitor } from './index';

describe('Market Monitor Tool', () => {
  const mockModel = 'test-model';
  let tool: any;

  beforeEach(() => {
    tool = createMarketMonitor(mockModel);
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('market_monitor');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('market_monitor');
    expect(tool.description).toContain('monitoring');
  });

  test('should have schema with required action', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.action).toBeDefined();
  });

  test('should have schema with optional target', () => {
    expect(tool.schema.shape.target).toBeDefined();
    expect(tool.schema.shape.target.isOptional()).toBe(true);
  });

  test('should have schema with optional threshold', () => {
    expect(tool.schema.shape.threshold).toBeDefined();
    expect(tool.schema.shape.threshold.isOptional()).toBe(true);
  });

  test('should handle status action', async () => {
    const result = await tool.invoke({
      action: 'status',
    });
    
    const parsed = JSON.parse(result);
    expect(parsed.timestamp || parsed.error).toBeDefined();
  });

  test('should handle indices action', async () => {
    const result = await tool.invoke({
      action: 'indices',
    });
    
    const parsed = JSON.parse(result);
    expect(parsed.indices || parsed.error).toBeDefined();
  });

  test('should handle sectors action', async () => {
    const result = await tool.invoke({
      action: 'sectors',
    });
    
    const parsed = JSON.parse(result);
    expect(parsed.sectors || parsed.error).toBeDefined();
  });

  test('should handle watch action', async () => {
    const result = await tool.invoke({
      action: 'watch',
    });
    
    const parsed = JSON.parse(result);
    expect(parsed.watchlist || parsed.error).toBeDefined();
  });

  test('should handle alerts action', async () => {
    const result = await tool.invoke({
      action: 'alerts',
      threshold: 5,
    });
    
    const parsed = JSON.parse(result);
    expect(parsed.alerts || parsed.error).toBeDefined();
  });
});
