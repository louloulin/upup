import { describe, expect, test } from 'bun:test';
import { DuckDBClient } from './duckdb.js';

function makeClient(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const client = new DuckDBClient({ connection: { query: async (sql) => { calls.push(sql); return { data: rows }; } }, allowedRoots: ['/tmp'] });
  return { client, calls };
}

describe('Pi portfolio DuckDB client', () => {
  test('executes bounded read-only queries and returns evidence-ready rows', async () => {
    const { client, calls } = makeClient([{ value: 42 }]);
    const result = await client.query('SELECT 42 AS value;', new AbortController().signal);
    expect(result.data).toEqual([{ value: 42 }]);
    expect(result.rowCount).toBe(1);
    expect(calls).toEqual(['SELECT 42 AS value']);
  });

  test('rejects mutations, multiple statements, and unsafe identifiers', async () => {
    const { client } = makeClient([]);
    await expect(client.query('DROP TABLE positions', new AbortController().signal)).rejects.toThrow('read-only');
    await expect(client.query('SELECT 1; SELECT 2', new AbortController().signal)).rejects.toThrow('one read-only');
    await expect(client.query("WITH changed AS (INSERT INTO positions VALUES (1) RETURNING *) SELECT * FROM changed", new AbortController().signal)).rejects.toThrow('read-only');
    await expect(client.query("SELECT * FROM read_parquet('/etc/passwd.parquet')", new AbortController().signal)).rejects.toThrow('read-only');
    await expect(client.timeseries({ table: 'positions', dateColumn: 'trade-date', valueColumn: 'close', interval: 'day', aggregation: 'sum' }, new AbortController().signal)).rejects.toThrow('valid SQL identifier');
  });

  test('builds validated time-series and portfolio SQL', async () => {
    const { client, calls } = makeClient([]);
    await client.timeseries({ table: 'prices', dateColumn: 'date', valueColumn: 'close', interval: 'month', aggregation: 'avg', startDate: '2026-01-01', endDate: '2026-02-01' }, new AbortController().signal);
    await client.portfolioAnalysis({ table: 'returns', returnsColumn: 'daily_return', analysisType: 'sharpe' }, new AbortController().signal);
    expect(calls[0]).toContain('DATE_TRUNC');
    expect(calls[0]).toContain("DATE '2026-01-01'");
    expect(calls[1]).toContain('STDDEV_SAMP');
  });

  test('fails closed for aborted requests and paths outside roots', async () => {
    const { client } = makeClient([]);
    const controller = new AbortController();
    controller.abort();
    await expect(client.query('SELECT 1', controller.signal)).rejects.toThrow('aborted');
    await expect(client.registerParquet('/etc/passwd.parquet', 'positions', new AbortController().signal)).rejects.toThrow('outside configured');
  });
});
