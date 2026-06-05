/**
 * Unit tests for Multi-Agent Research Tool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { createMultiAgentResearch } from './multi-agent-research';

describe('Multi-Agent Research Tool', () => {
  const mockModel = 'test-model';
  let tool: any;

  beforeEach(() => {
    tool = createMultiAgentResearch(mockModel);
  });

  test('should create tool with correct name', () => {
    expect(tool.name).toBe('multi_agent_research');
  });

  test('should have correct description', () => {
    expect(tool.description).toContain('multi_agent_research');
    expect(tool.description).toContain('agent');
  });

  test('should have schema with required code', () => {
    expect(tool.schema).toBeDefined();
    expect(tool.schema.shape.code).toBeDefined();
  });

  test('should have schema with optional agents array', () => {
    expect(tool.schema.shape.agents).toBeDefined();
    expect(tool.schema.shape.agents.isOptional()).toBe(true);
  });

  test('should have schema with optional period', () => {
    expect(tool.schema.shape.period).toBeDefined();
    expect(tool.schema.shape.period.isOptional()).toBe(true);
  });

  test('should handle missing TUSHARE_TOKEN', async () => {
    const originalToken = process.env.TUSHARE_TOKEN;
    delete process.env.TUSHARE_TOKEN;

    try {
      const result = await tool.invoke({
        code: '600519.SH',
      });
      
      const parsed = JSON.parse(result);
      expect(parsed.stock_code || parsed.error).toBeDefined();
    } finally {
      if (originalToken) {
        process.env.TUSHARE_TOKEN = originalToken;
      }
    }
  });
});
