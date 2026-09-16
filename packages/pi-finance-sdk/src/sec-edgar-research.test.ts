import { describe, expect, test } from 'bun:test';
import { createSecEdgarResearchDataFetcher } from './sec-edgar-research';

const TICKER_TABLE = {
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '2': { cik_str: 1067983, ticker: 'BRK-B', title: 'Berkshire Hathaway Inc.' },
};

const SUBMISSIONS_AAPL = {
  cik: '0000320193', name: 'Apple Inc.', tickers: ['AAPL'],
  filings: {
    recent: {
      form: ['10-K', '10-Q', '8-K', '10-Q'],
      filingDate: ['2025-10-31', '2026-05-01', '2026-09-10', '2026-07-31'],
      accessionNumber: ['0000320193-25-000078', '0000320193-26-000013', '0000320193-26-000045', '0000320193-26-000020'],
      primaryDocument: ['aapl-20250927.htm', 'aapl-20260328.htm', 'aapl-20260909.htm', 'aapl-20260627.htm'],
      primaryDocDescription: ['Annual report', 'Quarterly report', 'Current report', 'Quarterly report'],
    },
  },
};

const COMPANYFACTS_AAPL = {
  cik: '0000320193', entityName: 'Apple Inc.',
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        { end: '2024-09-28', val: 391000000000, form: '10-K', fp: 'FY', fy: 2024, filed: '2024-11-01', accn: '0000320193-24-000081', frame: 'CY2024' },
        { end: '2025-09-27', val: 410000000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
      ] } },
      NetIncomeLoss: { units: { USD: [
        { end: '2024-09-28', val: 95000000000, form: '10-K', fp: 'FY', fy: 2024, filed: '2024-11-01', accn: '0000320193-24-000081', frame: 'CY2024' },
        { end: '2025-09-27', val: 99000000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
        { end: '2026-03-28', val: 29578000000, form: '10-Q', fp: 'Q2', fy: 2026, filed: '2026-05-01', accn: '0000320193-26-000013' },
      ] } },
      GrossProfit: { units: { USD: [
        { end: '2025-09-27', val: 196000000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
      ] } },
      Assets: { units: { USD: [
        { end: '2025-09-27', val: 360000000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
      ] } },
      StockholdersEquity: { units: { USD: [
        { end: '2025-09-27', val: 80000000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
      ] } },
      WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [
        { end: '2025-09-27', val: 15500000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
      ] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [
        { end: '2025-09-27', val: 110000000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31', accn: '0000320193-25-000078', frame: 'CY2025' },
      ] } },
    },
  },
};

const NASDAQ_AAPL = {
  data: {
    symbol: 'AAPL', companyName: 'Apple Inc. Common Stock', exchange: 'NASDAQ-GS',
    primaryData: {
      lastSalePrice: '$332.4812', netChange: '1.12', percentageChange: '0.34',
      lastTradeTimestamp: 'Sep 16, 2026 5:59 PM ET', isRealTime: false, currency: 'USD',
    },
  },
  status: { rCode: 200 },
};

const NASDAQ_ETF = {
  data: { symbol: 'SPY', companyName: 'SPDR S&P 500 ETF', primaryData: { lastSalePrice: '$757.39', lastTradeTimestamp: 'Sep 15, 2026 4:00 PM ET', currency: 'USD' } },
  status: { rCode: 200 },
};

const BAD_STOCKS = { data: null, status: { rCode: 400, bCodeMessage: [{ code: 1001, errorMessage: 'Symbol not exists.' }] } };

function fixtureFetcher(routes: ReadonlyMap<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, payload] of routes) {
      if (url.includes(needle)) return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(`unexpected url in fixture: ${url}`, { status: 599 });
  }) as typeof fetch;
}

describe('createSecEdgarResearchDataFetcher', () => {
  test('answers a US stock-price snapshot from Nasdaq with a real USD price and SEC company name', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['api/quote/AAPL/info', NASDAQ_AAPL],
      ])),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    });
    const response = await fetcher('https://api.financialdatasets.ai/prices/snapshot/?ticker=AAPL', {});
    expect(response.status).toBe(200);
    const body = await response.json() as { snapshot: Record<string, unknown>; sourceUrls: string[] };
    expect(body.snapshot).toMatchObject({ price: 332.4812, currency: 'USD', as_of: '2026-09-16', name: 'Apple Inc. Common Stock' });
    expect(body.sourceUrls[0]).toContain('api.nasdaq.com/api/quote/AAPL/info');
    expect(body.sourceUrls[1]).toBe('https://data.sec.gov/submissions/CIK0000320193.json');
  });

  test('derives US financial-metrics snapshot from SEC companyfacts, including EPS / ROE / book value', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['companyfacts/CIK0000320193', COMPANYFACTS_AAPL],
        ['submissions/CIK0000320193', SUBMISSIONS_AAPL],
      ])),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    });
    const response = await fetcher('https://api.financialdatasets.ai/financial-metrics/snapshot/?ticker=AAPL', {});
    expect(response.status).toBe(200);
    const body = await response.json() as { snapshot: Record<string, unknown>; sourceUrls: string[] };
    expect(body.snapshot).toMatchObject({
      name: 'Apple Inc.',
      period: '2025-09-27',
      report_date: '2025-10-31',
      revenue: 410000000000,
      net_income: 99000000000,
      total_assets: 360000000000,
    });
    expect(body.snapshot.eps).toBeCloseTo(99000000000 / 15500000000, 2);
    expect(body.snapshot.roe_pct).toBeCloseTo((99000000000 / 80000000000) * 100, 2);
    expect(body.snapshot.gross_margin_pct).toBeCloseTo((196000000000 / 410000000000) * 100, 2);
    expect(body.snapshot.book_value_per_share).toBeCloseTo(80000000000 / 15500000000, 2);
    expect(body.snapshot.operating_cashflow_per_share).toBeCloseTo(110000000000 / 15500000000, 2);
    expect(body.sourceUrls).toEqual([
      'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
      'https://data.sec.gov/submissions/CIK0000320193.json',
    ]);
  });

  test('returns recent SEC 10-K/10-Q/8-K filings with real SEC archive URLs', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['submissions/CIK0000320193', SUBMISSIONS_AAPL],
      ])),
    });
    const response = await fetcher('https://api.financialdatasets.ai/filings/?ticker=AAPL&limit=10', {});
    const body = await response.json() as { filings: Array<Record<string, unknown>> };
    expect(body.filings.map((row) => row.form)).toEqual(['10-K', '10-Q', '8-K', '10-Q']);
    expect(body.filings[0]).toMatchObject({
      form: '10-K', filing_date: '2025-10-31', accession_number: '0000320193-25-000078',
      report_url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000078/aapl-20250927.htm',
      description: 'Annual report',
    });
  });

  test('answers earnings from SEC quarterly NetIncomeLoss rows', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['companyfacts/CIK0000320193', COMPANYFACTS_AAPL],
      ])),
    });
    const response = await fetcher('https://api.financialdatasets.ai/earnings/?ticker=AAPL', {});
    const body = await response.json() as { earnings: Array<Record<string, unknown>> };
    expect(body.earnings[0]).toMatchObject({ report_date: '2026-03-28', period: 'Q2', fiscal_year: 2026, net_income: 29578000000, form: '10-Q' });
  });

  test('returns an empty analyst-estimates envelope with no source URLs', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([['company_tickers.json', TICKER_TABLE]])),
    });
    const response = await fetcher('https://api.financialdatasets.ai/analyst-estimates/?ticker=AAPL&period=annual', {});
    const body = await response.json() as { analyst_estimates: unknown[]; sourceUrls: string[] };
    expect(body.analyst_estimates).toEqual([]);
    expect(body.sourceUrls).toEqual([]);
  });

  test('normalizes a dotted ticker to the dash-keyed SEC CIK', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['api/quote/BRK.B/info', { data: { companyName: 'Berkshire Hathaway Inc. Class B', primaryData: { lastSalePrice: '$516.76', lastTradeTimestamp: 'Sep 15, 2026 4:00 PM ET', currency: 'USD' } }, status: { rCode: 200 } }],
        ['submissions/CIK0001067983', SUBMISSIONS_AAPL],
      ])),
    });
    const response = await fetcher('https://api.financialdatasets.ai/prices/snapshot/?ticker=BRK.B', {});
    expect(response.status).toBe(200);
    const body = await response.json() as { snapshot: Record<string, unknown>; sourceUrls: string[] };
    expect(body.snapshot).toMatchObject({ price: 516.76, currency: 'USD' });
    expect(body.sourceUrls[1]).toBe('https://data.sec.gov/submissions/CIK0001067983.json');
  });

  test('falls through the Nasdaq ETF bucket for an ETF and reports the real etf price', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['api/quote/SPY/info?assetclass=stocks', BAD_STOCKS],
        ['api/quote/SPY/info?assetclass=etf', NASDAQ_ETF],
      ])),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    });
    const response = await fetcher('https://api.financialdatasets.ai/prices/snapshot/?ticker=SPY', {});
    expect(response.status).toBe(200);
    const body = await response.json() as { snapshot: Record<string, unknown> };
    expect(body.snapshot).toMatchObject({ price: 757.39, currency: 'USD', as_of: '2026-09-15' });
  });

  test('returns 404 for an unknown US path with an actionable message', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({ fetcher: fixtureFetcher(new Map()) });
    const response = await fetcher('https://api.financialdatasets.ai/unknown-path/?ticker=AAPL', {});
    expect(response.status).toBe(404);
    const body = await response.json() as { error: string };
    expect(body.error).toContain('has no mapping for /unknown-path');
  });

  test('returns 404 for a non-US ticker', async () => {
    const fetcher = createSecEdgarResearchDataFetcher({ fetcher: fixtureFetcher(new Map()) });
    const response = await fetcher('https://api.financialdatasets.ai/prices/snapshot/?ticker=600519.SH', {});
    expect(response.status).toBe(404);
  });

  test('anchors the snapshot to the newest fiscal year shared by every tag (AAPL mixed-tag regression)', async () => {
    // AAPL used `Revenues` through FY 2018 and switched to
    // `RevenueFromContractWithCustomerExcludingAssessedTax` from FY 2019.
    // Older snapshots mixed FY 2018 revenue ($265B) with FY 2025 net income
    // ($112B), producing a wrong 73.5% gross margin. The fix anchors every
    // field to the newest end date that every tag can cover.
    const companyfacts = {
      cik: '0000320193', entityName: 'Apple Inc.',
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [
            { end: '2017-09-30', val: 229234000000, form: '10-K', fp: 'FY', fy: 2017, filed: '2017-11-03' },
            { end: '2018-09-29', val: 265595000000, form: '10-K', fp: 'FY', fy: 2018, filed: '2018-11-05' },
          ] } },
          RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
            { end: '2024-09-28', val: 391035000000, form: '10-K', fp: 'FY', fy: 2024, filed: '2024-11-01' },
            { end: '2025-09-27', val: 416161000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
          NetIncomeLoss: { units: { USD: [
            { end: '2025-09-27', val: 112010000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
          GrossProfit: { units: { USD: [
            { end: '2025-09-27', val: 195201000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
          Assets: { units: { USD: [
            { end: '2025-09-27', val: 359241000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
          StockholdersEquity: { units: { USD: [
            { end: '2025-09-27', val: 73733000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
          WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [
            { end: '2025-09-27', val: 15004697000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
          NetCashProvidedByUsedInOperatingActivities: { units: { USD: [
            { end: '2025-09-27', val: 111482000000, form: '10-K', fp: 'FY', fy: 2025, filed: '2025-10-31' },
          ] } },
        },
      },
    };
    const fetcher = createSecEdgarResearchDataFetcher({
      fetcher: fixtureFetcher(new Map([
        ['company_tickers.json', TICKER_TABLE],
        ['companyfacts/CIK0000320193', companyfacts],
      ])),
      now: () => new Date('2026-09-17T00:00:00.000Z'),
    });
    const response = await fetcher('https://api.financialdatasets.ai/financial-metrics/snapshot/?ticker=AAPL', {});
    const body = await response.json() as { snapshot: Record<string, unknown> };
    expect(body.snapshot).toMatchObject({ period: '2025-09-27', report_date: '2025-10-31', revenue: 416161000000, net_income: 112010000000 });
    // FY 2025 gross margin must match FY 2025 revenue ($195.2B / $416.16B ≈ 46.9%),
    // not the FY 2018 mix-up that produced 73.5%.
    expect(body.snapshot.gross_margin_pct).toBeCloseTo((195201000000 / 416161000000) * 100, 1);
  });

});
