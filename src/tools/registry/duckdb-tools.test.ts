/**
 * DuckDB Tools Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { loadDuckDBTools, getDuckDBService } from './duckdb-tools';

describe('DuckDB Tools', () => {
  describe('loadDuckDBTools', () => {
    it('should load DuckDB tools', async () => {
      const tools = await loadDuckDBTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should have duckdb-query tool', async () => {
      const tools = await loadDuckDBTools();
      const queryTool = tools.find(t => t.name === 'duckdb-query');
      expect(queryTool).toBeDefined();
      expect(queryTool!.description).toContain('SQL');
    });

    it('should have duckdb-timeseries tool', async () => {
      const tools = await loadDuckDBTools();
      const tsTool = tools.find(t => t.name === 'duckdb-timeseries');
      expect(tsTool).toBeDefined();
    });

    it('should have duckdb-portfolio-analysis tool', async () => {
      const tools = await loadDuckDBTools();
      const portfolioTool = tools.find(t => t.name === 'duckdb-portfolio-analysis');
      expect(portfolioTool).toBeDefined();
    });

    it('should have duckdb-list-tables tool', async () => {
      const tools = await loadDuckDBTools();
      const listTool = tools.find(t => t.name === 'duckdb-list-tables');
      expect(listTool).toBeDefined();
    });

    it('should have duckdb-import-csv tool', async () => {
      const tools = await loadDuckDBTools();
      const importTool = tools.find(t => t.name === 'duckdb-import-csv');
      expect(importTool).toBeDefined();
    });

    it('should have duckdb-register-parquet tool', async () => {
      const tools = await loadDuckDBTools();
      const parquetTool = tools.find(t => t.name === 'duckdb-register-parquet');
      expect(parquetTool).toBeDefined();
    });

    it('should be concurrency safe', async () => {
      const tools = await loadDuckDBTools();
      expect(tools.every(t => t.concurrencySafe)).toBe(true);
    });
  });

  describe('getDuckDBService', () => {
    it('should return DuckDB service', () => {
      const service = getDuckDBService();
      expect(service).toBeDefined();
      expect(service.name).toBe('duckdb-service');
    });
  });
});