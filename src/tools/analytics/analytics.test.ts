/**
 * Unit tests for Performance Analytics Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createPerformanceAnalytics } from './index';

describe('Performance Analytics Tool', () => {
  const mockModel = 'test-model';
  let tool: any;

  beforeEach(() => {
    tool = createPerformanceAnalytics(mockModel);
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('performance_analytics');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('performance_analytics');
  });

  test('should have schema with required code', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.code).toBeDefined();
  });

  test('should have schema with action enum', () => {
    expect(tool.schema.shape.action).toBeDefined();
  });

  test('should have schema with optional parameters', () => {
    expect(tool.schema.shape.benchmark.isOptional()).toBe(true);
    expect(tool.schema.shape.period_days.isOptional()).toBe(true);
  });
});
