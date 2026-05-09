/**
 * Export Tools Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createExportPortfolioTool,
  createExportWatchlistTool,
  createExportDataTool,
} from './export-tools.js';

describe('Export Portfolio Tool', () => {
  const tool = createExportPortfolioTool();

  it('has correct name and schema', () => {
    expect(tool.name).toBe('export_portfolio');
    expect(tool.description).toContain('CSV');
  });

  it('accepts format parameter', async () => {
    const result = await tool.invoke({
      format: 'csv',
      includeTransactions: false,
    });
    expect(result).toBeDefined();
  });

  it('accepts json format', async () => {
    const result = await tool.invoke({
      format: 'json',
      includeTransactions: false,
    });
    expect(result).toBeDefined();
  });
});

describe('Export Watchlist Tool', () => {
  const tool = createExportWatchlistTool();

  it('has correct name and schema', () => {
    expect(tool.name).toBe('export_watchlist');
    expect(tool.description).toContain('CSV');
  });

  it('accepts format parameter', async () => {
    const result = await tool.invoke({
      format: 'csv',
      includeAlerts: true,
    });
    expect(result).toBeDefined();
  });

  it('accepts json format', async () => {
    const result = await tool.invoke({
      format: 'json',
      includeAlerts: false,
    });
    expect(result).toBeDefined();
  });
});

describe('Export Data Tool', () => {
  const tool = createExportDataTool();

  it('has correct name and schema', () => {
    expect(tool.name).toBe('export_data');
    expect(tool.description).toContain('CSV');
  });

  it('accepts data array', async () => {
    const data = [
      { symbol: 'AAPL', price: 150.5, change: 2.3 },
      { symbol: 'MSFT', price: 380.2, change: -1.5 },
    ];
    const result = await tool.invoke({
      data,
      filename: 'test_export',
      format: 'csv',
    });
    expect(result).toBeDefined();
  });

  it('handles empty data', async () => {
    const result = await tool.invoke({
      data: [],
      filename: 'empty_export',
      format: 'csv',
    });
    expect(result).toContain('empty');
  });

  it('handles json format', async () => {
    const data = [{ name: 'Test', value: 123 }];
    const result = await tool.invoke({
      data,
      filename: 'json_export',
      format: 'json',
    });
    expect(result).toBeDefined();
  });
});

describe('Export Data Types', () => {
  const tool = createExportDataTool();

  it('handles various data types', async () => {
    const data = [
      {
        string: 'text',
        number: 42,
        float: 3.14,
        boolean: true,
        null: null,
      },
    ];
    const result = await tool.invoke({
      data,
      filename: 'types_test',
      format: 'csv',
    });
    expect(result).toBeDefined();
  });

  it('handles nested objects as strings', async () => {
    const data = [
      { simple: 'value', complex: '{"nested": true}' },
    ];
    const result = await tool.invoke({
      data,
      filename: 'nested_test',
      format: 'csv',
    });
    expect(result).toBeDefined();
  });
});
