import { beforeEach, describe, expect, test } from 'bun:test';
import { createPhaseHandlerMap, createPhaseHandlers, type PhaseHandlerDependencies } from './phase-handlers.js';

const calls: string[] = [];
const positions = [{ symbol: 'AAPL', quantity: 10, avgCost: 150, realizedPnL: 0, openedAt: Date.now() }];
const sandbox = {
  async loadState() { calls.push('loadState'); },
  async getPositions() { calls.push('getPositions'); return positions; },
  async getBalance() { calls.push('getBalance'); return { cash: 1_000_000, marketValue: 1_000, totalEquity: 1_001_000, currency: 'CNY' }; },
  async getQuote(symbol: string) { calls.push(`getQuote:${symbol}`); return { symbol, bid: 99, ask: 100, last: 99.5, timestamp: Date.now() }; },
  async placeOrder(input: { symbol: string; side: string; type: string; quantity: number }) { calls.push(`placeOrder:${input.side}`); return { ...input, id: 'fixture', status: 'filled', filledQuantity: input.quantity, avgFillPrice: 100, commission: 1 }; },
};
const dependencies: PhaseHandlerDependencies = {
  getStockPrice: { invoke: async () => { calls.push('price'); return 'price'; } } as any,
  getKeyRatios: { invoke: async () => { calls.push('ratios'); return 'ratios'; } } as any,
  getAnalystEstimates: { invoke: async () => { calls.push('estimates'); return 'estimates'; } } as any,
  getEarnings: { invoke: async () => { calls.push('earnings'); return 'earnings'; } } as any,
  getFilings: { invoke: async () => { calls.push('filings'); return 'filings'; } } as any,
  calculateValuationRatios: () => { calls.push('valuation-ratios'); return { pe_ratio: 20, pb_ratio: 3, pcf_ratio: 15, market_cap: 100, price: 100 }; },
  calculateDCF: () => { calls.push('dcf'); return { intrinsic_value_per_share: 120, enterprise_value: 100, equity_value: 100, projected_fcf: [], terminal_value: 100, pv_of_fcf: [], pv_of_terminal: 100, shares_outstanding: null, net_debt: 0, assumptions: { growth_rate: 0.08, discount_rate: 0.1, terminal_growth_rate: 0.03, projection_years: 10 } }; },
  backtestLumpSum: async () => { calls.push('backtest'); return { config: {}, fundName: 'fixture', totalInvested: 100, finalValue: 112, totalReturn: 12, totalReturnPercent: 0.12, annualizedReturn: 0.12, volatility: 0.1, sharpeRatio: 0.8, maxDrawdown: -0.05, monthlyReturns: [], trades: [], dataPoints: [] } as any; },
  generateBacktestReport: () => 'fixture report',
  getSandbox: async () => sandbox as any,
  attribution: () => { calls.push('attribution'); return { method: 'combined', result: { brinson: { allocation: 0, selection: 0, interaction: 0, activeReturn: 0, bySector: [] }, style: { factors: [], activeReturn: 0, residual: 0 }, sector: { sectors: [], activeReturn: 0, classification: 'shenwan-l1' } } }; },
};

function plan(ticker = 'NVDA', goal = '分析'): any {
  return { id: 'fixture-plan', intent: '分析', createdAt: new Date(), updatedAt: new Date(), goal, constraints: [], outputFormat: 'markdown', status: 'active', phase: 'confirm', state: 'in_progress', steps: [], ticker, phases: ['research', 'valuation', 'backtest', 'trade', 'review'], toolBindings: {}, stepResults: {} };
}

describe('createPhaseHandlers', () => {
  beforeEach(() => calls.length = 0);

  test('exposes all five phases and handler map', () => {
    const handlers = createPhaseHandlers(dependencies);
    expect(Object.keys(handlers)).toEqual(['research', 'valuation', 'backtest', 'trade', 'review']);
    expect(Object.keys(createPhaseHandlerMap(dependencies))).toHaveLength(5);
  });

  test('research invokes the five finance adapters', async () => {
    const result = await createPhaseHandlers(dependencies).research(plan(), 'research');
    expect(result.error).toBeUndefined();
    expect(calls).toEqual(expect.arrayContaining(['price', 'ratios', 'estimates', 'earnings', 'filings']));
  });

  test('valuation and backtest use injected deterministic adapters', async () => {
    const handlers = createPhaseHandlers(dependencies);
    await handlers.valuation(plan(), 'valuation');
    await handlers.backtest(plan(), 'backtest');
    expect(calls).toEqual(expect.arrayContaining(['valuation-ratios', 'dcf', 'backtest']));
  });

  test('trade and review use the sandbox and attribution adapters', async () => {
    const handlers = createPhaseHandlers(dependencies);
    await handlers.trade(plan('NVDA', '建仓 NVDA'), 'trade');
    await handlers.review(plan(), 'review');
    expect(calls).toEqual(expect.arrayContaining(['getPositions', 'getBalance', 'getQuote:NVDA', 'placeOrder:buy', 'attribution']));
  });

  test('missing ticker returns a safe error without invoking tools', async () => {
    const result = await createPhaseHandlers(dependencies).research(plan(''), 'research');
    expect(result.error).toBe('no_ticker');
    expect(calls).toHaveLength(0);
  });
});
