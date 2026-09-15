import { describe, expect, test } from 'bun:test';
import { NativeFilingsClient } from './filings';

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('Finance Pi native SEC filings client', () => {
  test('fetches metadata and inferred filing sections without an LLM planner', async () => {
    const requests: string[] = [];
    const client = new NativeFilingsClient({ apiKey: 'test-key', baseUrl: 'https://fixture.invalid', fetcher: async (input) => {
      const url = String(input); requests.push(url);
      if (url.includes('/filings/items/')) return response({ sections: [{ title: 'Risk factors' }] });
      return response({ filings: [{ accession_number: '0000320193-24-000123', filing_type: '10-K', filing_date: '2024-11-01' }] });
    } });
    const result = await client.read({ query: 'AAPL risk factors', limit: 2 }, new AbortController().signal);
    expect(result.ticker).toBe('AAPL');
    expect(result.filingTypes).toEqual(['10-K']);
    expect(result.content[0]).toMatchObject({ accession_number: '0000320193-24-000123', filing_type: '10-K' });
    expect(requests[0]).toContain('filing_type=10-K');
    expect(requests[1]).toContain('item=Item-1A');
  });

  test('supports explicit types/items and company aliases', async () => {
    const requests: string[] = [];
    const client = new NativeFilingsClient({ apiKey: 'test-key', baseUrl: 'https://fixture.invalid', fetcher: async (input) => {
      requests.push(String(input));
      return response({ filings: [{ accession_number: '0000320193-24-000124', filing_type: '10-Q' }] });
    } });
    await client.read({ query: 'quarterly performance', ticker: 'Apple', filing_types: ['10-Q'], items: ['Part-1,Item-2'] }, new AbortController().signal);
    expect(requests[0]).toContain('ticker=AAPL');
    expect(requests[0]).toContain('filing_type=10-Q');
    expect(requests[1]).toContain('item=Part-1%2CItem-2');
  });

  test('fails closed for missing credentials, malformed input, API errors, and aborts', async () => {
    await expect(new NativeFilingsClient({ baseUrl: 'https://fixture.invalid', fetcher: async () => response({}) }).read({ query: 'AAPL risk' }, new AbortController().signal)).rejects.toThrow('FINANCIAL_DATASETS_API_KEY');
    await expect(new NativeFilingsClient({ apiKey: 'test-key', fetcher: async () => response({}) }).read({ query: '风险因素' }, new AbortController().signal)).rejects.toThrow('ticker is required');
    await expect(new NativeFilingsClient({ apiKey: 'test-key', fetcher: async () => response({}, 503) }).read({ query: 'AAPL risk' }, new AbortController().signal)).rejects.toThrow('503');
    const controller = new AbortController(); controller.abort();
    await expect(new NativeFilingsClient({ apiKey: 'test-key', fetcher: async () => response({}) }).read({ query: 'AAPL risk' }, controller.signal)).rejects.toThrow('aborted');
  });
});
