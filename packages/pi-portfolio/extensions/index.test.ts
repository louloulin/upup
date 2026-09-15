import { describe, expect, test } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import portfolioExtension from './index';

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };
function makeTools() {
  const tools = new Map<string, RegisteredTool>();
  const entries: unknown[] = [];
  portfolioExtension({ events: createEventBus(), registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool), appendEntry: (_type: string, data: unknown) => entries.push({ type: 'custom', customType: _type, data }) } as never);
  return tools;
}
const book = [{ sector: 'Technology', weight: 1, return: 0.1 }];

describe('Pi portfolio extension', () => {
    test('registers the production and auditable portfolio tools', () => { expect([...makeTools().keys()].sort()).toEqual(['add_position', 'add_position_multi', 'calculate_alpha', 'compare_to_benchmark', 'convert_currency', 'create_portfolio', 'delete_portfolio', 'duckdb-import-csv', 'duckdb-list-tables', 'duckdb-portfolio-analysis', 'duckdb-query', 'duckdb-register-parquet', 'duckdb-timeseries', 'export_portfolio', 'get_exchange_rate', 'get_portfolio', 'get_portfolio_multi', 'list_benchmarks', 'list_currencies', 'list_portfolios', 'portfolio_attribution', 'portfolio_brinson_attribution', 'portfolio_sector_attribution', 'portfolio_style_attribution', 'remove_position', 'remove_position_multi', 'switch_portfolio', 'update_position']); });
  test('portfolio_attribution returns native evidence for combined attribution', async () => {
    const result = await makeTools().get('portfolio_attribution')!.execute('portfolio-native-1', {
      method: 'combined',
      portfolio: { totalReturn: 0.1, holdings: book },
      benchmark: { totalReturn: 0.08, holdings: [{ sector: 'Technology', weight: 1, return: 0.08 }] },
      sectorClassification: 'shenwan-l1',
      style: {
        portfolioExposures: { Size: 0.2, Value: 0.2, Momentum: 0.2, Volatility: 0.2 },
        benchmarkExposures: { Size: 0.1, Value: 0.1, Momentum: 0.1, Volatility: 0.1 },
        factorReturns: { Size: 0.01, Value: 0.02, Momentum: 0.03, Volatility: 0.04 },
      },
    }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ method: 'combined', activeReturn: 0.02 });
    expect(result.details).toMatchObject({ auditId: 'portfolio-native-1', evidence: [{ source: 'upup-pi://portfolio/attribution' }] });
  });
  test('returns Brinson evidence and active return', async () => {
    const result = await makeTools().get('portfolio_brinson_attribution')!.execute('brinson-1', { portfolio: book, benchmark: [{ sector: 'Technology', weight: 1, return: 0.08 }] }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text).activeReturn).toBeCloseTo(0.02, 8);
    expect(result.details).toMatchObject({ auditId: 'brinson-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://portfolio/portfolio-brinson-attribution' }] });
  });
  test('returns style and sector attribution results', async () => {
    const tools = makeTools();
    const style = await tools.get('portfolio_style_attribution')!.execute('style-1', { portfolioExposures: { Size: 0.2, Value: 0.2, Momentum: 0.2, Volatility: 0.2 }, benchmarkExposures: { Size: 0.1, Value: 0.1, Momentum: 0.1, Volatility: 0.1 }, factorReturns: { Size: 0.01, Value: 0.02, Momentum: 0.03, Volatility: 0.04 }, activeReturn: 0.02 }, new AbortController().signal);
    const sector = await tools.get('portfolio_sector_attribution')!.execute('sector-1', { portfolio: book, benchmark: [{ sector: 'Technology', weight: 1, return: 0.08 }], classification: 'shenwan-l1' }, new AbortController().signal);
    expect(JSON.parse(style.content[0].text).factors).toHaveLength(4); expect(JSON.parse(sector.content[0].text).classification).toBe('shenwan-l1');
  });
  test('honors abort before calculation', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await makeTools().get('portfolio_brinson_attribution')!.execute('abort-1', { portfolio: book, benchmark: book }, controller.signal);
    expect(result.isError).toBe(true);
  });
  test('returns native evidence and fails closed for DuckDB queries', async () => {
    const tools = makeTools();
    const aborted = new AbortController(); aborted.abort();
    const result = await tools.get('duckdb-query')!.execute('duckdb-abort', { sql: 'SELECT 1' }, aborted.signal);
    expect(result.isError).toBe(true);
    expect(result.details.auditId).toBe('duckdb-abort');
    expect(result.details.evidence).toBeUndefined();
  });
  test('returns native evidence for benchmark and currency tools', async () => {
    const tools = makeTools();
    const benchmark = await tools.get('compare_to_benchmark')!.execute('benchmark-1', { portfolioReturn: 12, benchmarks: ['^GSPC'] }, new AbortController().signal);
    const currency = await tools.get('convert_currency')!.execute('currency-1', { amount: 100, from: 'USD', to: 'CNY' }, new AbortController().signal);
    const rate = await tools.get('get_exchange_rate')!.execute('rate-1', { from: 'USD', to: 'CNY' }, new AbortController().signal);
    expect(JSON.parse(benchmark.content[0].text).benchmarks[0].alpha).toBe(2);
    expect(JSON.parse(currency.content[0].text)).toMatchObject({ convertedAmount: 724, rate: 7.24 });
    expect(JSON.parse(rate.content[0].text)).toMatchObject({ from: 'USD', to: 'CNY', rate: 7.24 });
    expect(benchmark.details).toMatchObject({ evidence: [{ source: 'upup-pi://portfolio/compare-to-benchmark' }] });
    expect(currency.details).toMatchObject({ evidence: [{ source: 'upup-pi://portfolio/convert-currency' }] });
  });
  test('persists session portfolio state and computes P&L through native tools', async () => {
    const tools = makeTools();
    const signal = new AbortController().signal;
    const context = { sessionManager: { getEntries: () => [] } };
    const added = await tools.get('add_position')!.execute('position-1', { symbol: 'AAPL', quantity: 10, avgCost: 150 }, signal, undefined, context);
    const report = await tools.get('get_portfolio')!.execute('portfolio-1', { prices: { AAPL: 180 } }, signal, undefined, context);
    expect(JSON.parse(added.content[0].text)).toMatchObject({ position: { symbol: 'AAPL' }, cash: 98500 });
    expect(JSON.parse(report.content[0].text).summary).toMatchObject({ totalMarketValue: 1800, totalPnl: 300, totalValue: 100300 });
    expect(report.details).toMatchObject({ evidence: [{ source: 'upup-pi://portfolio/get-portfolio' }], portfolioState: { positionCount: 1 } });
    const removed = await tools.get('remove_position')!.execute('position-2', { symbol: 'AAPL', atPrice: 180 }, signal, undefined, context);
    expect(JSON.parse(removed.content[0].text).cash).toBe(100300);
  });
  test('executes named portfolio lifecycle through native Pi tools', async () => {
    const tools = makeTools();
    const signal = new AbortController().signal;
    await tools.get('create_portfolio')!.execute('multi-default', { name: 'default' }, signal);
    const created = await tools.get('create_portfolio')!.execute('multi-create', { name: 'growth', initialCash: 50000 }, signal);
    const added = await tools.get('add_position_multi')!.execute('multi-add', { portfolio: 'growth', symbol: 'AAPL', quantity: 10, avgCost: 100 }, signal);
    const report = await tools.get('get_portfolio_multi')!.execute('multi-report', { portfolio: 'growth', prices: { AAPL: 120 } }, signal);
    expect(JSON.parse(created.content[0].text)).toMatchObject({ portfolio: { name: 'growth' }, activePortfolio: 'growth' });
    expect(JSON.parse(added.content[0].text).portfolio.positions.AAPL).toMatchObject({ quantity: 10, avgCost: 100 });
    expect(JSON.parse(report.content[0].text).summary).toMatchObject({ totalMarketValue: 1200, totalPnl: 200, cash: 49000, totalValue: 50200 });
    expect(report.details).toMatchObject({ multiPortfolioState: { activePortfolio: 'growth', portfolioCount: 2 } });
    const switched = await tools.get('switch_portfolio')!.execute('multi-switch', { name: 'default' }, signal);
    expect(JSON.parse(switched.content[0].text).activePortfolio).toBe('default');
    const aborted = new AbortController(); aborted.abort();
    expect((await tools.get('list_portfolios')!.execute('multi-abort', {}, aborted.signal)).isError).toBe(true);
  });
});
