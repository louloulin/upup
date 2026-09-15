import { describe, expect, test } from 'bun:test';
import { NativeFundHistoryClient, getNativeFundHistoryForRange } from './fund-history';

function payload(items: readonly Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ Data: { LSJZList: items } }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('NativeFundHistoryClient', () => {
  test('normalizes Eastmoney history and sends bounded request headers', async () => {
    const requests: Array<{ url: string; referer: string | null }> = [];
    const client = new NativeFundHistoryClient({ pageSize: 2, interPageDelayMs: 0, fetcher: async (input, init) => {
      requests.push({ url: String(input), referer: new Headers(init?.headers).get('Referer') });
      return payload([
        { FSRQ: '2026-09-12', DWJZ: '1.2345', LJJZ: '2.3456', JZZZL: '1.2%' },
        { FSRQ: '2026-09-11', DWJZ: '1.2000', LJJZ: '2.3000', JZZZL: '-0.4' },
      ]);
    } });
    const result = await client.getPage(' 110022 ');
    expect(result).toEqual([
      { date: '2026-09-12', nav: 1.2345, accumulated: 2.3456, dailyReturn: 1.2 },
      { date: '2026-09-11', nav: 1.2, accumulated: 2.3, dailyReturn: -0.4 },
    ]);
    expect(requests[0]).toMatchObject({ referer: 'https://fund.eastmoney.com/' });
    expect(requests[0]?.url).toContain('fundCode=110022');
  });

  test('filters ranges, rejects invalid inputs, and honors abort', async () => {
    const client = new NativeFundHistoryClient({ interPageDelayMs: 0, fetcher: async () => payload([{ FSRQ: '2026-01-01', DWJZ: '1', LJJZ: '1', JZZZL: '0' }]) });
    await expect(getNativeFundHistoryForRange('110022', '2025-12-01', '2026-01-31', { interPageDelayMs: 0, fetcher: async () => payload([{ FSRQ: '2026-01-01', DWJZ: '1', LJJZ: '1', JZZZL: '0' }]) })).resolves.toHaveLength(1);
    expect(() => new NativeFundHistoryClient({ pageSize: 0 })).toThrow('pageSize');
    expect(() => client.getPage('bad')).toThrow('six-digit');
    const controller = new AbortController();
    controller.abort();
    await expect(client.getPage('110022', 1, controller.signal)).rejects.toThrow('aborted');
  });
});
