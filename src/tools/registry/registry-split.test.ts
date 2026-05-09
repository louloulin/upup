/**
 * Tests for registry split — verifies the domain loader architecture.
 */

import { describe, it, expect } from 'bun:test';
import { RegisteredTool } from './types.js';
import { loadFinanceTools } from './finance-tools.js';
import { loadFilesystemTools } from './filesystem-tools.js';
import { loadQuantTools } from './quant-tools.js';

describe('Registry Split: Domain Loaders', () => {
  describe('loadFinanceTools', () => {
    it('returns finance tool registrations', () => {
      const tools = loadFinanceTools('gpt-4o');
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.every(t => t.name && t.tool && typeof t.concurrencySafe === 'boolean')).toBe(true);
    });

    it('includes US market tools', () => {
      const tools = loadFinanceTools('gpt-4o');
      const names = tools.map(t => t.name);
      expect(names).toContain('get_financials');
      expect(names).toContain('get_market_data');
      expect(names).toContain('read_filings');
      expect(names).toContain('stock_screener');
    });

    it('includes A-share tools', () => {
      const tools = loadFinanceTools('gpt-4o');
      const names = tools.map(t => t.name);
      expect(names).toContain('get_astock_price');
      expect(names).toContain('screen_astocks');
      expect(names).toContain('get_sector_data');
    });

    it('all finance tools have compact descriptions', () => {
      const tools = loadFinanceTools('gpt-4o');
      expect(tools.every(t => typeof t.compactDescription === 'string' && t.compactDescription.length > 0)).toBe(true);
    });
  });

  describe('loadFilesystemTools', () => {
    it('returns filesystem tool registrations', () => {
      const tools = loadFilesystemTools();
      expect(tools.length).toBeGreaterThan(0);

      const names = tools.map(t => t.name);
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('edit_file');
      expect(names).toContain('glob');
      expect(names).toContain('grep');
      expect(names).toContain('memory_search');
      expect(names).toContain('heartbeat');
      expect(names).toContain('cron');
    });
  });

  describe('loadQuantTools', () => {
    it('returns quantitative tool registrations', () => {
      const tools = loadQuantTools();
      expect(tools.length).toBeGreaterThan(0);

      const names = tools.map(t => t.name);
      expect(names).toContain('calculate_var');
      expect(names).toContain('calculate_sharpe');
      expect(names).toContain('calculate_option_price');
      expect(names).toContain('calculate_capital_gains_tax');
      expect(names).toContain('calculate_kelly');
      expect(names).toContain('score_data_source');
    });
  });
});
