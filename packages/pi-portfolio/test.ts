import { describe, expect, test } from 'bun:test';
import { addMultiPortfolioPosition, addPortfolioPosition, calculateBenchmarkAlpha, calculateBrinsonAttribution, calculateMultiPortfolioReport, calculatePortfolioAttribution, calculatePortfolioReport, calculateSectorAttribution, calculateStyleAttribution, comparePortfolioToBenchmarks, convertCurrencyAmount, createInitialMultiPortfolioState, createInitialPortfolioState, createMultiPortfolio, deleteMultiPortfolio, getCurrencyRate, listBenchmarks, listCurrencies, listMultiPortfolios, removeMultiPortfolioPosition, removePortfolioPosition, switchMultiPortfolio, updatePortfolioPosition, type PortfolioBook } from './src/index.js';
const portfolio: PortfolioBook = { holdings: [{ sector: 'Technology', weight: 0.6, return: 0.12 }, { sector: 'Healthcare', weight: 0.4, return: 0.04 }] };
const benchmark: PortfolioBook = { holdings: [{ sector: 'Technology', weight: 0.5, return: 0.1 }, { sector: 'Healthcare', weight: 0.5, return: 0.05 }] };
describe('pi-portfolio', () => {
  test('computes Brinson attribution with additive identity', () => { const result = calculateBrinsonAttribution(portfolio, benchmark); expect(result.bySector).toHaveLength(2); expect(result.activeReturn).toBeCloseTo(result.allocation + result.selection + result.interaction, 8); expect(result.activeReturn).toBeCloseTo(0.013, 8); });
  test('dispatches production portfolio attribution methods', () => {
    const result = calculatePortfolioAttribution({ method: 'combined', portfolio: { ...portfolio, totalReturn: 0.088 }, benchmark: { ...benchmark, totalReturn: 0.075 }, sectorClassification: 'gics-l2' });
    expect(result.method).toBe('combined');
    expect(result.activeReturn).toBeCloseTo(0.013, 8);
    expect(result.result).toHaveProperty('brinson');
    expect(result.result).toHaveProperty('sector');
  });
  test('computes sector attribution with explicit classification', () => { const result = calculateSectorAttribution(portfolio, benchmark, 'gics-l2'); expect(result.classification).toBe('gics-l2'); expect(result.sectors.map((sector) => sector.sector)).toEqual(['Healthcare', 'Technology']); expect(result.activeReturn).toBeCloseTo(0.013, 8); });
  test('computes style factor contributions and residual', () => { const result = calculateStyleAttribution({ portfolioExposures: { Size: 0.4, Value: 0.2, Momentum: 0.5, Volatility: -0.1 }, benchmarkExposures: { Size: 0.2, Value: 0.3, Momentum: 0.2, Volatility: 0 }, factorReturns: { Size: 0.03, Value: 0.02, Momentum: 0.04, Volatility: -0.01 }, activeReturn: 0.02 }); expect(result.factors).toHaveLength(4); expect(result.factors.find((factor) => factor.name === 'Momentum')?.contribution).toBeCloseTo(0.012, 8); expect(result.residual).toBeCloseTo(0.003, 8); });
  test('fails closed for empty or duplicate sectors', () => { expect(() => calculateBrinsonAttribution({ holdings: [] }, benchmark)).toThrow('must not be empty'); expect(() => calculateSectorAttribution({ holdings: [{ sector: 'Technology', weight: 0.5, return: 0.1 }, { sector: 'Technology', weight: 0.5, return: 0.1 }] }, benchmark, 'shenwan-l1')).toThrow('duplicate sector'); });
  test('compares deterministic benchmarks and calculates alpha', () => { expect(listBenchmarks()).toHaveLength(5); expect(comparePortfolioToBenchmarks(12, ['^GSPC', '000300']).benchmarks[0]).toMatchObject({ symbol: '000300', alpha: 4 }); expect(calculateBenchmarkAlpha(12, '^GSPC')).toMatchObject({ benchmarkReturn: 10, alpha: 2 }); });
  test('converts currencies and exposes supported currency metadata', () => { expect(listCurrencies()).toHaveLength(11); expect(getCurrencyRate('USD', 'CNY')).toBe(7.24); expect(convertCurrencyAmount(100, 'USD', 'CNY')).toMatchObject({ from: 'USD', to: 'CNY', convertedAmount: 724, rate: 7.24 }); expect(convertCurrencyAmount(1, 'XXX', 'USD')).toBeNull(); });
  test('rejects invalid benchmark and currency inputs', () => { expect(() => calculateBenchmarkAlpha(1, 'XXX')).toThrow('Unknown benchmark'); expect(() => convertCurrencyAmount(1, '', 'USD')).toThrow('from must not be empty'); });
  test('mutates a portfolio state with cash and transaction invariants', () => {
    const initial = createInitialPortfolioState();
    const added = addPortfolioPosition(initial, { symbol: 'aapl', quantity: 10, avgCost: 150, purchaseDate: '2026-01-01' });
    expect(added.position).toMatchObject({ symbol: 'AAPL', quantity: 10, avgCost: 150 });
    expect(added.state.cash).toBe(98500);
    expect(added.transaction?.type).toBe('buy');
    const updated = updatePortfolioPosition(added.state, { symbol: 'AAPL', quantity: 12 });
    expect(updated.position?.quantity).toBe(12);
    const report = calculatePortfolioReport(updated.state, { AAPL: 180 });
    expect(report.summary).toMatchObject({ totalPositions: 1, totalMarketValue: 2160, totalPnl: 360, cash: 98500, totalValue: 100660 });
    const removed = removePortfolioPosition(updated.state, { symbol: 'AAPL', atPrice: 180 });
    expect(removed.state.cash).toBe(100660);
    expect(Object.keys(removed.state.positions)).toHaveLength(0);
  });
  test('fails closed for insufficient cash and missing positions', () => {
    const initial = createInitialPortfolioState(100);
    expect(addPortfolioPosition(initial, { symbol: 'AAPL', quantity: 1, avgCost: 150 }).error).toContain('Insufficient cash');
    expect(updatePortfolioPosition(initial, { symbol: 'AAPL', quantity: 1 }).error).toContain('not found');
    expect(removePortfolioPosition(initial, { symbol: 'AAPL' }).error).toContain('not found');
  });
  test('manages named portfolios with active switching and average-in cost basis', () => {
    const initial = createInitialMultiPortfolioState();
    const defaultCreated = createMultiPortfolio(initial, { name: 'default' });
    const created = createMultiPortfolio(defaultCreated.state, { name: 'growth', initialCash: 50000 });
    expect(created.state.activePortfolio).toBe('growth');
    const added = addMultiPortfolioPosition(created.state, { symbol: 'AAPL', quantity: 10, avgCost: 100 });
    const averaged = addMultiPortfolioPosition(added.state, { symbol: 'AAPL', quantity: 10, avgCost: 200 });
    expect(averaged.portfolio?.positions.AAPL).toMatchObject({ quantity: 20, avgCost: 150 });
    expect(listMultiPortfolios(averaged.state)).toContainEqual({ name: 'growth', positionCount: 1, isActive: true });
    const report = calculateMultiPortfolioReport(averaged.state, 'growth', { AAPL: 180 });
    expect(report?.summary).toMatchObject({ totalMarketValue: 3600, totalPnl: 600, cash: 47000, totalValue: 50600 });
    const switched = switchMultiPortfolio(averaged.state, 'default');
    expect(switched.state.activePortfolio).toBe('default');
    expect(deleteMultiPortfolio(createInitialMultiPortfolioState(), 'default').error).toContain('not found');
    expect(removeMultiPortfolioPosition(averaged.state, { portfolio: 'growth', symbol: 'AAPL', atPrice: 180 }).removed).toEqual({ quantity: 20, proceeds: 3600 });
  });
  test('rejects duplicate and unknown named portfolios', () => {
    const initial = createInitialMultiPortfolioState();
    const created = createMultiPortfolio(initial, { name: 'income' });
    expect(createMultiPortfolio(created.state, { name: 'income' }).error).toContain('already exists');
    expect(switchMultiPortfolio(created.state, 'missing').error).toContain('not found');
    expect(removeMultiPortfolioPosition(created.state, { portfolio: 'missing', symbol: 'AAPL' }).error).toContain('not found');
  });
});
