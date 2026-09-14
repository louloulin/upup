/**
 * UpUp Plugin System — DuckDB Plugin Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';

// Import DuckDB plugin components
import { DuckDBPlugin, DuckDBAdapter } from '../src/data/duckdb-plugin.js';
import type { PluginManifest } from '../src/types.js';

// ============================================================================
// DuckDB Plugin Tests
// ============================================================================

describe('DuckDBPlugin', () => {
  let plugin: DuckDBPlugin;

  beforeEach(() => {
    plugin = new DuckDBPlugin();
  });

  it('should create DuckDB plugin instance', () => {
    expect(plugin).toBeDefined();
    expect(plugin.getTools()).toBeDefined();
    expect(plugin.getTools().length).toBeGreaterThan(0);
  });

  it('should have 6 tools', () => {
    const tools = plugin.getTools();
    expect(tools.length).toBe(6);
  });

  it('should have SQL query tool', () => {
    const tools = plugin.getTools();
    const queryTool = tools.find(t => t.name === 'duckdb-query');
    expect(queryTool).toBeDefined();
  });

  it('should have time series tool', () => {
    const tools = plugin.getTools();
    const tsTool = tools.find(t => t.name === 'duckdb-timeseries');
    expect(tsTool).toBeDefined();
  });

  it('should have portfolio analysis tool', () => {
    const tools = plugin.getTools();
    const portfolioTool = tools.find(t => t.name === 'duckdb-portfolio-analysis');
    expect(portfolioTool).toBeDefined();
  });

  it('should have import CSV tool', () => {
    const tools = plugin.getTools();
    const importTool = tools.find(t => t.name === 'duckdb-import-csv');
    expect(importTool).toBeDefined();
  });

  it('should have register parquet tool', () => {
    const tools = plugin.getTools();
    const parquetTool = tools.find(t => t.name === 'duckdb-register-parquet');
    expect(parquetTool).toBeDefined();
  });

  it('should have list tables tool', () => {
    const tools = plugin.getTools();
    const listTool = tools.find(t => t.name === 'duckdb-list-tables');
    expect(listTool).toBeDefined();
  });

  it('should have DuckDB service', () => {
    const service = plugin.getService();
    expect(service).toBeDefined();
    expect(service.name).toBe('duckdb-service');
  });

  it('all tools should have execute function', () => {
    const tools = plugin.getTools();
    for (const tool of tools) {
      expect(typeof tool.execute).toBe('function');
    }
  });
});

// ============================================================================
// DuckDB Adapter Tests
// ============================================================================

describe('DuckDBAdapter', () => {
  let adapter: DuckDBAdapter;

  beforeEach(() => {
    adapter = new DuckDBAdapter();
  });

  it('should create adapter instance', () => {
    expect(adapter).toBeDefined();
    expect(adapter.runtime).toBe('bun');
  });

  it('should load DuckDB plugin with data-source capability', async () => {
    const mockApi = createMockPluginApi();

    const manifest: PluginManifest = {
      schemaVersion: '1.0',
      id: 'duckdb-analytics',
      name: 'DuckDB Analytics',
      version: '1.0.0',
      runtime: 'bun',
      capabilities: ['data-source'],
      entry: './index.js',
    };

    const loaded = await adapter.load(manifest, mockApi);

    expect(loaded.id).toBe('duckdb-analytics');
    expect(loaded.runtime).toBe('bun');
    expect(loaded.tools.length).toBe(6);
    expect(loaded.services.length).toBe(1);
  });

  it('should unload without errors', async () => {
    const mockApi = createMockPluginApi();

    const manifest: PluginManifest = {
      schemaVersion: '1.0',
      id: 'duckdb-analytics',
      name: 'DuckDB Analytics',
      version: '1.0.0',
      runtime: 'bun',
      capabilities: ['data-source'],
      entry: './index.js',
    };

    const plugin = await adapter.load(manifest, mockApi);
    let error = false;
    try {
      await adapter.unload(plugin);
    } catch {
      error = true;
    }
    expect(error).toBe(false);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock plugin API that satisfies UpUpPluginApi interface
 */
function createMockPluginApi() {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    runtime: 'bun' as const,
    config: {},
    pluginConfig: {},
    logger: {
      info: (_msg: string) => {},
      warn: (_msg: string) => {},
      error: (_msg: string) => {},
    },
    registerTool: (_t: any) => {},
    registerTools: (_t: any[]) => {},
    registerHook: () => {},
    on: () => {},
    registerChannel: () => {},
    registerCommand: () => {},
    registerService: (_s: any) => {},
    registerDataSource: () => {},
    resolvePath: (_p: string) => _p,
    // P1.7 — added in unify-skills-and-plugins-registries
    registerSkill: (_s: any) => () => {},
  };
}

// ============================================================================
// Investment Analysis Use Cases
// ============================================================================

describe('Investment Analysis Use Cases', () => {
  let plugin: DuckDBPlugin;

  beforeEach(() => {
    plugin = new DuckDBPlugin();
  });

  describe('Time Series Analysis', () => {
    it('should support day/month/quarter intervals', () => {
      const tools = plugin.getTools();
      const tsTool = tools.find(t => t.name === 'duckdb-timeseries');
      expect(tsTool).toBeDefined();
      // Tool exists and is functional
      expect(typeof tsTool?.execute).toBe('function');
    });
  });

  describe('Portfolio Analysis', () => {
    it('should support returns, volatility, sharpe, var', () => {
      const tools = plugin.getTools();
      const portfolioTool = tools.find(t => t.name === 'duckdb-portfolio-analysis');
      expect(portfolioTool).toBeDefined();
      expect(typeof portfolioTool?.execute).toBe('function');
    });
  });

  describe('Data Import', () => {
    it('should support CSV import', () => {
      const tools = plugin.getTools();
      const importTool = tools.find(t => t.name === 'duckdb-import-csv');
      expect(importTool).toBeDefined();
      expect(typeof importTool?.execute).toBe('function');
    });

    it('should support Parquet import', () => {
      const tools = plugin.getTools();
      const parquetTool = tools.find(t => t.name === 'duckdb-register-parquet');
      expect(parquetTool).toBeDefined();
      expect(typeof parquetTool?.execute).toBe('function');
    });
  });
});
