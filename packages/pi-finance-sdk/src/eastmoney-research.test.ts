import { describe, expect, test } from 'bun:test';
import { createEastmoneyResearchDataFetcher, eastmoneyResearchTarget } from './eastmoney-research';
import { NativeResearchDataClient } from './research-data';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

describe('eastmoney research data adapter', () => {
  test('maps A-share tickers onto Eastmoney secids', () => {
    expect(eastmoneyResearchTarget('600519.SH', 'cn')).toMatchObject({ secid: '1.600519', currency: 'CNY' });
    expect(eastmoneyResearchTarget('000001.SZ', 'cn')).toMatchObject({ secid: '0.000001' });
    expect(eastmoneyResearchTarget('900901.BJ', 'cn')).toMatchObject({ secid: '0.900901' });
    expect(eastmoneyResearchTarget('700.HK', 'hk')).toMatchObject({ ticker: '00700.HK', secid: '116.00700', currency: 'HKD' });
  });

  test('serves the Financial Datasets paths from real Eastmoney responses', async () => {
    const requested: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('push2.eastmoney.com')) {
        return json({ data: { f43: 125800, f58: '贵州茅台', f59: 2, f60: 126500, f86: 1789000000 } });
      }
      if (url.includes('datacenter-web') && url.includes('RPT_LICO_FN_CPD')) {
        return json({ result: { data: [{ SECUCODE: '600519.SH', SECURITY_NAME_ABBR: '贵州茅台', REPORTDATE: '2026-06-30 00:00:00', DATATYPE: '2026年 半年报', BOARD_NAME: '白酒Ⅱ', TOTAL_OPERATE_INCOME: 92278072083.21, PARENT_NETPROFIT: 44516880421.86, BASIC_EPS: 35.57, WEIGHTAVG_ROE: 16.75, XSMLL: 89.55, BPS: 200.98, YSTZ: 1.3, SJLTZ: -1.95 }] } });
      }
      if (url.includes('reportapi.eastmoney.com')) {
        return json({ hits: 1, data: [{ title: '2026年中报点评', orgSName: '西南证券', publishDate: '2026-08-21 00:00:00.000', emRatingName: '买入', researcher: '朱会振', predictThisYearEps: '69.83', predictThisYearPe: '18.59', indvInduName: '白酒Ⅱ' }] });
      }
      if (url.includes('np-anotice-stock')) {
        return json({ data: { list: [{ art_code: 'AN202608141827994407', title: '贵州茅台:关于召开2026年半年度业绩说明会的公告', notice_date: '2026-08-15 00:00:00', columns: [{ column_name: '其他' }] }] } });
      }
      throw new Error(`unexpected request: ${url}`);
    }) as typeof fetch;
    const adapter = createEastmoneyResearchDataFetcher({ market: 'cn', fetcher });

    const quote = await (await adapter('https://api.financialdatasets.ai/prices/snapshot/?ticker=600519.SH')).json() as { snapshot: Record<string, unknown> };
    expect(quote.snapshot).toMatchObject({ ticker: '600519.SH', price: 1258, previous_close: 1265, currency: 'CNY', provider: 'eastmoney' });
    expect(requested[0]).toContain('push2.eastmoney.com');

    const metrics = await (await adapter('https://api.financialdatasets.ai/financial-metrics/snapshot/?ticker=600519.SH')).json() as { snapshot: Record<string, unknown>; sourceUrls: string[] };
    expect(metrics.snapshot).toMatchObject({ report_date: '2026-06-30', eps: 35.57, roe_pct: 16.75, gross_margin_pct: 89.55, industry: '白酒Ⅱ' });
    expect(metrics.sourceUrls[0]).toContain('datacenter-web.eastmoney.com');

    const estimates = await (await adapter('https://api.financialdatasets.ai/analyst-estimates/?ticker=600519.SH')).json() as { analyst_estimates: Record<string, unknown>[] };
    expect(estimates.analyst_estimates[0]).toMatchObject({ institution: '西南证券', rating: '买入', eps_estimate_this_year: 69.83, report_date: '2026-08-21' });

    const filings = await (await adapter('https://api.financialdatasets.ai/filings/?ticker=600519.SH&limit=3')).json() as { filings: Record<string, unknown>[] };
    expect(filings.filings[0]).toMatchObject({ published_at: '2026-08-15', category: '其他', type: 'announcement' });
    expect(requested.some((url) => url.includes('stock_list=600519'))).toBe(true);
  });

  test('falls back to the last daily close when the quote host refuses the connection', async () => {
    let klineRequested = false;
    const adapter = createEastmoneyResearchDataFetcher({
      market: 'cn',
      fetcher: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('push2.eastmoney.com')) throw new TypeError('The socket connection was closed unexpectedly');
        klineRequested = true;
        return json({ data: { klines: ['2026-09-16,1258.00'] } });
      }) as typeof fetch,
    });
    const payload = await (await adapter('https://api.financialdatasets.ai/prices/snapshot/?ticker=600519.SH')).json() as { snapshot: Record<string, unknown> };
    expect(klineRequested).toBe(true);
    expect(payload.snapshot).toMatchObject({ price: 1258, as_of: '2026-09-16' });
  });

  test('reports Hong Kong coverage honestly instead of fabricating rows', async () => {
    const adapter = createEastmoneyResearchDataFetcher({ market: 'hk', fetcher: (async () => { throw new Error('network must not be called'); }) as typeof fetch });
    const estimates = await (await adapter('https://api.financialdatasets.ai/analyst-estimates/?ticker=00700.HK')).json() as { analyst_estimates: unknown[]; note: string };
    expect(estimates.analyst_estimates).toEqual([]);
    expect(estimates.note).toContain('仅覆盖 A 股');
    const filings = await (await adapter('https://api.financialdatasets.ai/filings/?ticker=00700.HK')).json() as { filings: unknown[] };
    expect(filings.filings).toEqual([]);
  });

  test('needs no credentials for CN research and never claims the proxy URL as a source', async () => {
    const client = new NativeResearchDataClient({
      marketFetchers: { cn: createEastmoneyResearchDataFetcher({ market: 'cn', fetcher: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('datacenter-web')) return json({ result: { data: [{ SECUCODE: '600519.SH', REPORTDATE: '2026-06-30 00:00:00', BASIC_EPS: 35.57 }] } });
        return json({ data: { f43: 125800, f59: 2, f86: 1789000000 } });
      }) as typeof fetch }) },
      marketProviders: { cn: 'eastmoney' },
    });
    const envelope = JSON.parse(await client.getKeyRatios({ ticker: '600519.SH', market: 'cn' })) as { sourceUrls: string[]; provider: string; data: { snapshot: Record<string, unknown> } };
    expect(envelope.provider).toBe('eastmoney');
    expect(envelope.sourceUrls[0]).toContain('datacenter-web.eastmoney.com');
    expect(envelope.sourceUrls.some((url) => url.includes('financialdatasets'))).toBe(false);
    expect(envelope.data.snapshot.eps).toBe(35.57);
  });

  test('still requires a key for markets without a credential-free provider', async () => {
    const client = new NativeResearchDataClient({ marketFetchers: { cn: createEastmoneyResearchDataFetcher({ market: 'cn' }) }, marketProviders: { cn: 'some-vendor' } });
    await expect(client.getKeyRatios({ ticker: '600519.SH', market: 'cn' })).rejects.toThrow(/credentials are required/u);
  });
});
