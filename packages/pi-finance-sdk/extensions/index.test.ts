import { describe, expect, test } from 'bun:test';
import financeEvidenceExtension from './index.js';

describe('Pi finance SDK extension', () => {
  test('registers the complete deterministic finance tool set', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    financeEvidenceExtension({
      on: () => undefined,
      registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
    } as never);

    expect([...tools.keys()]).toEqual([
      'finance_evidence_quote',
      'finance_evidence_fundamentals',
      'finance_evidence_news',
      'finance_evidence_search',
      'finance_evidence_trading_day',
    ]);
    const result = await tools.get('finance_evidence_quote')!.execute('quote-1', { symbol: '600519.SH' }, new AbortController().signal);
    expect(result.details).toMatchObject({
      auditId: 'quote-1',
      evidence: [{ source: 'upup-fixture://pi-finance-sdk/quote', asOf: '2026-09-12' }],
    });
  });
});
