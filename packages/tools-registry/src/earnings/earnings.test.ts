/**
 * Unit tests for Earnings Prediction Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createEarningsPrediction } from './index';

describe('Earnings Prediction Tool', () => {
  let tool: any;

  beforeEach(() => {
    tool = createEarningsPrediction('test-model');
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('earnings_prediction');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('earnings_prediction');
  });

  test('should have schema with action enum', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.action).toBeDefined();
  });

  test('should have schema with required code', () => {
    expect(tool.schema.shape.code).toBeDefined();
  });
});
