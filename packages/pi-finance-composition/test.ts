import { describe, expect, test } from 'bun:test';
import { createFinanceComposition } from './src/index';

describe('@upup/pi-finance-composition', () => {
  test('creates injected finance services without contacting providers', async () => {
    const composition = createFinanceComposition({ sessionId: 'finance-test', marketQuoteFetcher: async () => new Response('{}') });
    expect(composition.getInvestmentWorkflowServices()).toHaveProperty('getResearchData');
    expect(composition.trendStore).toBeDefined();
  });

  test('routes workflow history through the declared market provider', async () => {
    let body: Record<string, unknown> | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const composition = createFinanceComposition({
      sessionId: 'finance-market-test',
      marketHistoryProviders: { hk: 'tushare' },
      marketHistoryApiKeys: { hk: 'hk-token' },
      marketHistoryBaseUrls: { hk: 'https://tushare.test/pro' },
      marketHistoryFetchers: { hk: async (_input, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close', 'vol'], items: [['00700.HK', '20260130', 10, 11, 9, 10.5, 100], ['00700.HK', '20260131', 10.5, 11.5, 10, 11, 120]] } }), { status: 200 });
      } },
    });
    const result = await composition.getInvestmentWorkflowServices().getMarketHistory('00700.HK', '2026-01-01', new AbortController().signal, 'hk');
    expect(body).toMatchObject({ api_name: 'hk_daily', token: 'hk-token', params: { ts_code: '00700.HK' } });
    expect(result.evidence).toMatchObject({ source: 'https://tushare.test/pro', query: `00700.HK:hk:2026-01-01:${today}` });
    expect(result.bars).toHaveLength(2);
  });
});
