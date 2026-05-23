/**
 * Unit tests for Sector Analysis Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createSectorAnalysis } from './index';

describe('Sector Analysis Tool', () => {
  let tool: any;

  beforeEach(() => {
    tool = createSectorAnalysis('test-model');
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('sector_analysis');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('sector_analysis');
    expect(tool.description).toContain('sector');
  });

  test('should have schema with action enum', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.action).toBeDefined();
  });

  test('should have schema with optional sector', () => {
    expect(tool.schema.shape.sector.isOptional()).toBe(true);
  });
});
