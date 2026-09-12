import { describe, expect, test } from 'bun:test';
import { createEvidence, createFinanceResult } from './src/index.js';

describe('pi-finance-sdk', () => {
  test('creates traceable evidence results without secrets', () => {
    const evidence = createEvidence({
      id: 'e1',
      source: 'fixture://quote',
      retrievedAt: '2026-09-13T00:00:00.000Z',
      asOf: '2026-09-12',
      query: '600519',
      freshness: 'historical',
      auditId: 'a1',
    });
    const result = createFinanceResult({ symbol: '600519', close: 100 }, [evidence], 'a1');
    expect(result.evidence[0].id).toBe('e1');
    expect(JSON.stringify(result)).not.toContain('API_KEY');
  });
});
