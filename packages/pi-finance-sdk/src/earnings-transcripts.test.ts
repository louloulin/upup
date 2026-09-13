import { describe, expect, test } from 'bun:test';
import { NativeEarningsTranscriptClient } from './earnings-transcripts.js';

function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }); }

describe('NativeEarningsTranscriptClient', () => {
  test('extracts recent 8-K transcript references through the filings client', async () => {
    const client = new NativeEarningsTranscriptClient({ apiKey: 'test-key', baseUrl: 'https://fixture.invalid', now: () => Date.parse('2026-02-01T00:00:00Z'), fetcher: async (input) => {
      const url = String(input);
      if (url.includes('/filings/items/')) return response({ text: 'Revenue and EPS exceeded consensus. Management expects continued growth.' });
      return response({ filings: [{ accession_number: '0000000001-26-000001', filing_type: '8-K', filing_date: '2026-01-15', report_url: 'https://sec.test/8k' }] });
    } });
    const result = await client.fetch('nvda', { limit: 2, windowDays: 90 });
    expect(result).toMatchObject([{ filingDate: '2026-01-15', url: 'https://sec.test/8k', excerpt: expect.stringContaining('Revenue and EPS exceeded consensus.') }]);
  });

  test('filters stale filings and validates bounds', async () => {
    const client = new NativeEarningsTranscriptClient({ apiKey: 'test-key', baseUrl: 'https://fixture.invalid', fetcher: async () => response({ filings: [{ accession_number: '0000000001-20-000001', filing_type: '8-K', filing_date: '2020-01-01' }] }) });
    expect(await client.fetch('AAPL', { windowDays: 30 })).toEqual([]);
    await expect(client.fetch('AAPL', { limit: 11 })).rejects.toThrow('between 1 and 10');
  });
});
