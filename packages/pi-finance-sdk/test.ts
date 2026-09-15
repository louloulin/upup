import { describe, expect, test } from 'bun:test';
import { createEvidence, createFinanceResult } from './src/index';
import { compareNativeFunds, getNativeFundDetail, getNativeFundHoldings, getNativeFundManager, getNativeFundPerformance, getTopNativeFunds, searchNativeFunds, screenNativeFunds } from './src/fund-catalog';
import { createInitialFundWatchlistState, followNativeFund, listNativeFollowedFunds, unfollowNativeFund } from './src/fund-watchlist';
import { createInitialFundAlertState, createNativeFundAlert, deleteNativeFundAlert, listNativeFundAlerts } from './src/fund-alerts';
import { getNativeAStockFinancials, listNativeAStockFinancialSymbols } from './src/astock-financials';
import { getNativeAStockNews, listNativeAStockNewsSymbols } from './src/astock-news';
import { getNativeFinancialSnapshot, listNativeFinancialSymbols } from './src/financial-snapshot';
import { getNativeCompanyProfile, getNativeRisks, getNativeSectors } from './src/knowledge-snapshot';
import { calculateNativePnl, calculateNativeTax, calculateNativeTradesTax } from './src/tax-calculator';
import { listNativeInvestmentStrategies } from './src/strategy-catalog';
import { NativeSandboxBroker } from './src/sandbox-trading';
import { createInitialKnowledgeJournalState, listTrackedCompanies, listTrackedSectors, trackNativeCompany, trackNativeSector } from './src/knowledge-journal';

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
  test('returns deterministic historical A-share financial snapshots', () => {
    expect(getNativeAStockFinancials('比亚迪')).toMatchObject({ ts_code: '002594.SZ', name: '比亚迪', asOf: '2026-09-12' });
    expect(getNativeAStockFinancials('600519', '2025')?.periods).toHaveLength(1);
    expect(getNativeAStockFinancials('999999')).toBeNull();
    expect(listNativeAStockFinancialSymbols()).toContain('300750.SZ');
  });
  test('returns deterministic historical A-share news snapshots with fail-closed filters', () => {
    expect(getNativeAStockNews({ code: '比亚迪', limit: 1 })).toMatchObject({ type: 'announcement', tsCode: '002594.SZ', asOf: '2026-09-12', count: 1, items: [{ tsCode: '002594.SZ' }] });
    expect(getNativeAStockNews({ code: 'market', startDate: '20260911', endDate: '2026-09-12' })?.items).toHaveLength(2);
    expect(getNativeAStockNews({ code: '999999' })).toBeNull();
    expect(listNativeAStockNewsSymbols()).toEqual(['002594.SZ', '300750.SZ', '600519.SH']);
    expect(() => getNativeAStockNews({ code: '002594.SZ', startDate: '2026-09-13', endDate: '2026-09-12' })).toThrow('startDate');
  });
  test('returns deterministic financial snapshots for US and A-share companies', () => {
    expect(getNativeFinancialSnapshot('Apple')).toMatchObject({ symbol: 'AAPL', company: 'Apple', market: 'us', scope: 'historical-offline-snapshot', metrics: { latestRevenue: 4161.6 } });
    expect(getNativeFinancialSnapshot('比亚迪财务')).toMatchObject({ symbol: '002594.SZ', company: '比亚迪', market: 'cn', metrics: { latestNetIncome: 412.7 } });
    expect(getNativeFinancialSnapshot('unknown')).toBeNull();
    expect(listNativeFinancialSymbols()).toContain('AAPL');
  });
  test('queries the deterministic investment knowledge snapshot with fail-closed filters', () => {
    expect(getNativeCompanyProfile('贵州茅台')).toMatchObject({ ticker: '600519.SH', name: '贵州茅台', asOf: '2026-09-12' });
    expect(getNativeCompanyProfile('600519')).toMatchObject({ ticker: '600519.SH' });
    expect(getNativeCompanyProfile('UNKNOWN')).toBeNull();
    expect(getNativeRisks({ ticker: '002594.SZ', severity: 'high', type: 'sector' })).toMatchObject([{ id: 'risk-002594-competition', ticker: '002594.SZ' }]);
    expect(getNativeRisks({ type: 'market' })).toHaveLength(1);
    expect(getNativeRisks({ severity: 'critical' })).toEqual([]);
    expect(getNativeSectors('新能源')).toMatchObject([{ name: '新能源', outlook: 'neutral', asOf: '2026-09-12' }]);
    expect(getNativeSectors('unknown-sector')).toEqual([]);
  });
  test('lists deterministic investment strategies with independent filters', () => {
    expect(listNativeInvestmentStrategies({ riskTolerance: 'conservative', timeHorizon: 'long' }).map((strategy) => strategy.id)).toEqual(['value-investing', 'index-investing']);
    const strategies = listNativeInvestmentStrategies();
    const secondRead = listNativeInvestmentStrategies();
    expect(strategies).toHaveLength(5);
    expect(strategies[0].parameters).not.toBe(secondRead[0].parameters);
  });
  test('keeps knowledge journal updates immutable and keyed by normalized identifiers', () => {
    const initial = createInitialKnowledgeJournalState();
    const company = trackNativeCompany(initial, { ticker: 'aapl', name: 'Apple', sector: 'Technology', industry: 'Consumer Electronics', summary: 'Note', keyMetrics: { pe: 34 } }, '2026-09-14T00:00:00.000Z');
    const sector = trackNativeSector(company.state, { name: 'Technology', description: 'Note', trends: ['AI'], outlook: 'bullish' }, '2026-09-14T00:00:00.000Z');
    expect(initial.companies).toEqual({});
    expect(listTrackedCompanies(sector.state)).toMatchObject([{ ticker: 'AAPL' }]);
    expect(listTrackedSectors(sector.state)).toMatchObject([{ name: 'Technology', outlook: 'bullish' }]);
  });
  test('calculates deterministic tax and P&L from explicit historical dates', () => {
    const longTerm = calculateNativeTax({ symbol: 'AAPL', quantity: 100, purchasePrice: 100, currentPrice: 150, purchaseDate: '2024-01-01', asOf: '2026-09-12', jurisdiction: 'us' });
    expect(longTerm).toMatchObject({ gain: 5000, holdingPeriodDays: 985, isLongTerm: true, taxRate: 0.2, estimatedTax: 1000, asOf: '2026-09-12' });
    const shortTerm = calculateNativeTax({ symbol: 'TSLA', quantity: 50, purchasePrice: 200, currentPrice: 280, purchaseDate: '2026-06-12', asOf: '2026-09-12', jurisdiction: 'us' });
    expect(shortTerm).toMatchObject({ gain: 4000, isLongTerm: false, taxRate: 0.37, estimatedTax: 1480 });
    expect(calculateNativeTax({ symbol: '0700.HK', quantity: 1, purchasePrice: 300, currentPrice: 400, purchaseDate: '2024-01-01', asOf: '2026-09-12', jurisdiction: 'hongkong' }).estimatedTax).toBe(0);
    expect(() => calculateNativeTax({ symbol: 'BAD', quantity: 1, purchasePrice: 10, currentPrice: 12, purchaseDate: '2026-10-01', asOf: '2026-09-12', jurisdiction: 'us' })).toThrow('purchaseDate');
    const trades = calculateNativeTradesTax({ jurisdiction: 'us', trades: [{ symbol: 'AAPL', quantity: 100, purchasePrice: 100, sellPrice: 150, purchaseDate: '2024-01-01', sellDate: '2026-09-12' }, { symbol: 'BAD', quantity: 1, purchasePrice: 10, sellPrice: 9, purchaseDate: 'not-a-date', sellDate: '2026-09-12' }] });
    expect(trades).toMatchObject({ tradeCount: 1, summary: { totalGain: 5000, totalEstimatedTax: 1000, longTermTrades: 1 }, errors: ['BAD: Invalid date: not-a-date'] });
    expect(calculateNativePnl({ currency: 'USD', trades: [{ symbol: 'AAPL', quantity: 2, purchasePrice: 100, sellPrice: 120 }, { symbol: 'TSLA', quantity: 1, purchasePrice: 200, sellPrice: 180 }] })).toMatchObject({ tradeCount: 2, winningTrades: 1, losingTrades: 1, totalPnl: 20, winRate: 50 });
  });
  test('searches and screens the offline fund catalog deterministically', () => {
    expect(searchNativeFunds('110022')).toEqual([{ code: '110022', name: '易方达消费行业股票', type: '股票型', scale: 180, netGrowth12: 15.2 }]);
    const screened = screenNativeFunds({ type: '混合型', minReturn: 15, limit: 3 });
    expect(screened.length).toBe(3);
    expect(screened.every((fund) => fund.type === '混合型' && (fund.netGrowth12 ?? 0) >= 15)).toBe(true);
    expect(getTopNativeFunds(2).map((fund) => fund.netGrowth12)).toEqual([25.3, 22.1]);
  });
  test('returns auditable historical fund detail snapshots', () => {
    expect(getNativeFundDetail('110022')).toMatchObject({ code: '110022', asOf: '2026-09-12', snapshot: { company: '易方达基金', manager: '萧楠' } });
    expect(getNativeFundPerformance('110022')?.performance.oneYear).toBe(15.2);
    expect(getNativeFundHoldings('110022')?.holdings[0]).toMatchObject({ stockCode: '600519.SH', holdingPercent: 9.1 });
    expect(getNativeFundManager('110022')?.manager).toMatchObject({ name: '萧楠', company: '易方达基金' });
    expect(getNativeFundDetail('999999')).toBeNull();
  });
  test('compares native funds deterministically and reports missing codes', () => {
    expect(compareNativeFunds(['110022', '161725', '005827'], '1Y')).toMatchObject({
      period: '1Y',
      asOf: '2026-09-12',
      funds: [{ code: '110022', returnPct: 15.2 }, { code: '005827', returnPct: 13.6 }, { code: '161725', returnPct: 8.5 }],
      missingCodes: [],
    });
    expect(compareNativeFunds(['110022', '999999']).missingCodes).toEqual(['999999']);
    expect(() => compareNativeFunds(['110022'])).toThrow();
  });
  test('keeps watchlist transitions immutable and deterministic', () => {
    const initial = createInitialFundWatchlistState();
    const followed = followNativeFund(initial, { code: '110022', name: '易方达消费行业股票' }, '2026-09-13T00:00:00.000Z');
    expect(followed.added).toBe(true);
    expect(listNativeFollowedFunds(followed.state)).toMatchObject([{ code: '110022', name: '易方达消费行业股票' }]);
    expect(followNativeFund(followed.state, { code: '110022', name: '易方达消费行业股票' }, '2026-09-13T00:01:00.000Z').added).toBe(false);
    const removed = unfollowNativeFund(followed.state, '110022');
    expect(removed.removed).toBe(true);
    expect(listNativeFollowedFunds(removed.state)).toEqual([]);
  });
  test('keeps alert definitions immutable and explicit about evaluation state', () => {
    const created = createNativeFundAlert(createInitialFundAlertState(), { id: 'alert-1', fundCode: '110022', fundName: '易方达消费行业股票', type: 'change_down', value: 5, createdAt: '2026-09-13T00:00:00.000Z' });
    expect(created.created).toMatchObject({ enabled: true, triggerCount: 0, value: 5 });
    expect(listNativeFundAlerts(created.state)).toHaveLength(1);
    const deleted = deleteNativeFundAlert(created.state, 'alert-1');
    expect(deleted.deleted).toBe(true);
    expect(listNativeFundAlerts(deleted.state)).toEqual([]);
    expect(() => createNativeFundAlert(createInitialFundAlertState(), { id: 'alert-2', fundCode: '110022', fundName: '易方达消费行业股票', type: 'price_above', createdAt: '2026-09-13T00:00:00.000Z' })).toThrow();
  });
  test('executes sandbox orders deterministically and persists the native state', async () => {
    const stateFile = `/tmp/upup-pi-finance-broker-${Date.now()}.json`;
    const broker = new NativeSandboxBroker({ stateFile, initialCash: 100_000, quoteProvider: async (symbol) => ({ symbol, bid: 99.9, ask: 100.1, last: 100, timestamp: Date.now() }) });
    const order = await broker.placeOrder({ symbol: '600519.SH', side: 'buy', quantity: 100 });
    expect(order).toMatchObject({ status: 'filled', filledQuantity: 100, symbol: '600519.SH' });
    expect((await broker.getPositions())[0]).toMatchObject({ symbol: '600519.SH', quantity: 100 });
    expect((await broker.getBalance()).cash).toBeLessThan(100_000);
    const restored = new NativeSandboxBroker({ stateFile, initialCash: 100_000, quoteProvider: async (symbol) => ({ symbol, bid: 99.9, ask: 100.1, last: 100, timestamp: Date.now() }) });
    await restored.loadState();
    expect((await restored.getPositions())[0]).toMatchObject({ symbol: '600519.SH', quantity: 100 });
    await Bun.file(stateFile).delete().catch(() => undefined);
  });
});
