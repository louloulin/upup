/**
 * Phase Handlers — 验证 5 步 phase 各自调用正确的 src/tools/* 工具
 *
 * v7 Sprint 3 — 验证 trade + review phase 接通 sandbox-engine + attribution
 *
 * 不验证输出内容,只验证:给定 plan,handler 调用了预期工具且返回结构正确
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ============================================================================
// Mock: sandbox-engine (BrokerAdapter for paper trading)
// ============================================================================

const invokeLog: string[] = [];

mock.module('../../tools/trading/sandbox-engine.js', () => {
  // 默认 mock: 1 个 AAPL 持仓 + 50,000 现金 + NVDA quote 100
  // 每个测试可重置
  const state = {
    cash: 1_000_000,
    positions: [
      { symbol: 'AAPL', quantity: 10, avgCost: 150, realizedPnL: 0, openedAt: Date.now() },
      { symbol: 'MSFT', quantity: 5, avgCost: 300, realizedPnL: 0, openedAt: Date.now() },
    ],
    orders: [] as any[],
  };

  const fakeSandbox = {
    name: 'sandbox',
    async loadState() { invokeLog.push('sandbox.loadState()'); },
    async reset() { state.cash = 1_000_000; state.positions = []; state.orders = []; },
    async getPositions() {
      invokeLog.push('sandbox.getPositions()');
      return [...state.positions];
    },
    async getBalance() {
      invokeLog.push('sandbox.getBalance()');
      const mv = state.positions.reduce(
        (s, p) => s + Math.abs(p.quantity) * (p.symbol === 'AAPL' ? 150 : 300),
        0,
      );
      return { cash: state.cash, marketValue: mv, totalEquity: state.cash + mv, currency: 'CNY' };
    },
    async getQuote(symbol: string) {
      invokeLog.push(`sandbox.getQuote(${symbol})`);
      return { symbol, bid: 99.5, ask: 100.5, last: 100, timestamp: Date.now() };
    },
    async placeOrder(input: any) {
      invokeLog.push(`sandbox.placeOrder(${JSON.stringify(input)})`);
      const order = {
        id: 'SB-TEST-1',
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        quantity: input.quantity,
        filledQuantity: input.quantity,
        avgFillPrice: 100.5,
        commission: 5,
        status: 'filled' as const,
        createdAt: Date.now(),
        filledAt: Date.now(),
      };
      state.orders.push(order);
      // 更新 in-memory state
      const existing = state.positions.find(p => p.symbol === input.symbol);
      if (input.side === 'buy') {
        if (existing) {
          const totalQty = existing.quantity + input.quantity;
          existing.avgCost =
            (existing.quantity * existing.avgCost + input.quantity * 100.5) / totalQty;
          existing.quantity = totalQty;
        } else {
          state.positions.push({
            symbol: input.symbol,
            quantity: input.quantity,
            avgCost: 100.5,
            realizedPnL: 0,
            openedAt: Date.now(),
          });
        }
        state.cash -= input.quantity * 100.5 + 5;
      } else {
        if (existing) {
          existing.quantity -= input.quantity;
          existing.realizedPnL += (100.5 - existing.avgCost) * input.quantity;
        }
        state.cash += input.quantity * 100.5 - 5;
      }
      return order;
    },
    async cancelOrder() { throw new Error('not used in test'); },
    async getOrder() { return null; },
    async listPendingOrders() { return []; },
  };

  return {
    SandboxBroker: class {
      constructor() { return fakeSandbox as any; }
    },
    __mockSandbox: fakeSandbox,
    __mockState: state,
  };
});

// ============================================================================
// Mock: portfolio/attribution
// ============================================================================

mock.module('../../tools/portfolio/attribution.js', () => ({
  attribution: (input: any) => {
    invokeLog.push(`attribution(${input.method})`);
    if (input.method === 'combined') {
      return {
        method: 'combined',
        result: {
          brinson: {
            allocation: 0.01,
            selection: 0.02,
            interaction: 0.005,
            activeReturn: 0.035,
            bySector: [{ sector: '科技', allocation: 0.01, selection: 0.02, interaction: 0.005 }],
          },
          style: {
            factors: [
              { name: 'Size', portfolioExposure: 0.5, benchmarkExposure: 0.5, factorReturn: 0.02, contribution: 0.01 },
              { name: 'Value', portfolioExposure: -0.2, benchmarkExposure: 0.0, factorReturn: 0.03, contribution: -0.006 },
              { name: 'Momentum', portfolioExposure: 0.3, benchmarkExposure: 0.1, factorReturn: 0.05, contribution: 0.01 },
              { name: 'Volatility', portfolioExposure: 0.1, benchmarkExposure: 0.1, factorReturn: -0.01, contribution: 0.0 },
            ],
            activeReturn: 0.014,
            residual: 0.0,
          },
          sector: {
            classification: 'shenwan-l1',
            sectors: [
              { sector: '科技', weightDiff: 0.05, sectorReturn: 0.12, benchmarkReturn: 0.08, contribution: 0.04 },
              { sector: '金融', weightDiff: -0.05, sectorReturn: 0.04, benchmarkReturn: 0.06, contribution: 0.005 },
            ],
            activeReturn: 0.045,
          },
        },
      };
    }
    if (input.method === 'brinson') {
      return {
        method: 'brinson',
        result: { allocation: 0.01, selection: 0.02, interaction: 0.005, activeReturn: 0.035, bySector: [] },
      };
    }
    return { method: input.method, result: {} };
  },
}));

// ============================================================================
// Mock: 保留旧 finance / valuation / fund / portfolio-tools 模拟(其他 handler 需要)
// ============================================================================

mock.module('../../tools/finance/index.js', () => {
  const log = (name: string) => (input: unknown) => {
    invokeLog.push(`finance.${name}(${JSON.stringify(input)})`);
    return Promise.resolve({ mocked: name, input });
  };
  return {
    getStockPrice: { invoke: log('getStockPrice') },
    getKeyRatios: { invoke: log('getKeyRatios') },
    getAnalystEstimates: { invoke: log('getAnalystEstimates') },
    getEarnings: { invoke: log('getEarnings') },
    getFilings: { invoke: log('getFilings') },
  };
});

mock.module('../../tools/valuation/valuation-tools.js', () => ({
  calculateValuationRatios: (input: unknown) => {
    invokeLog.push(`valuation.calculateValuationRatios(${JSON.stringify(input)})`);
    return { pe_ratio: 20, pb_ratio: 3, pcf_ratio: 15, market_cap: 100_000_000, price: 100 };
  },
  calculateDCF: (input: unknown) => {
    invokeLog.push(`valuation.calculateDCF(${JSON.stringify(input)})`);
    return {
      intrinsic_value_per_share: 120,
      enterprise_value: 120_000_000_000,
      equity_value: 120_000_000_000,
      projected_fcf: [1.08e9, 1.166e9, 1.26e9],
      terminal_value: 1.5e10,
    };
  },
}));

mock.module('../../tools/fund/fund-backtest.js', () => ({
  backtestLumpSum: async (ticker: string, months: number, amount: number) => {
    invokeLog.push(`fund.backtestLumpSum(${ticker}, ${months}, ${amount})`);
    return { total_return: 0.12, annualized: 0.12, sharpe: 0.8, max_drawdown: -0.05 };
  },
  generateBacktestReport: () => '# Mocked Backtest Report\nTotal return: 12%\n',
}));

// ============================================================================
// Re-import phase-handlers after mocks are registered
// ============================================================================

const { createPhaseHandlers: factory, createPhaseHandlerMap: mapFactory, __resetSandboxForTests } =
  await import('./phase-handlers.js');

function makePlan(ticker?: string, goal = '测试 goal', id = 'plan-test-123') {
  return {
    id,
    intent: '分析 ' + (ticker ?? 'NVDA'),
    createdAt: new Date(),
    updatedAt: new Date(),
    goal,
    constraints: [],
    outputFormat: 'markdown' as const,
    status: 'active' as const,
    phase: 'confirm' as const,
    state: 'in_progress' as const,
    steps: [],
    ticker,
    phases: ['research', 'valuation', 'backtest', 'trade', 'review'] as Array<'research' | 'valuation' | 'backtest' | 'trade' | 'review'>,
    toolBindings: {},
    stepResults: {},
  };
}

describe('createPhaseHandlers', () => {
  beforeEach(() => {
    invokeLog.length = 0;
    __resetSandboxForTests();
  });

  // --------------------------------------------------------------------------
  // 基础结构
  // --------------------------------------------------------------------------

  test('exposes all 5 phases', () => {
    const h = factory();
    expect(typeof h.research).toBe('function');
    expect(typeof h.valuation).toBe('function');
    expect(typeof h.backtest).toBe('function');
    expect(typeof h.trade).toBe('function');
    expect(typeof h.review).toBe('function');
  });

  test('createPhaseHandlerMap returns Partial<Record<ResearchPhase, PhaseHandler>>', () => {
    const m = mapFactory();
    expect(m.research).toBeDefined();
    expect(m.valuation).toBeDefined();
    expect(m.backtest).toBeDefined();
    expect(m.trade).toBeDefined();
    expect(m.review).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // research (保留旧测试)
  // --------------------------------------------------------------------------

  test('research phase invokes all 5 finance tools in parallel', async () => {
    const h = factory();
    const result = await h.research(makePlan('NVDA'), 'research');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('NVDA');
    expect(invokeLog.some(l => l.includes('getStockPrice'))).toBe(true);
    expect(invokeLog.some(l => l.includes('getKeyRatios'))).toBe(true);
    expect(invokeLog.some(l => l.includes('getAnalystEstimates'))).toBe(true);
    expect(invokeLog.some(l => l.includes('getEarnings'))).toBe(true);
    expect(invokeLog.some(l => l.includes('getFilings'))).toBe(true);
  });

  test('research without ticker returns graceful placeholder', async () => {
    const h = factory();
    const result = await h.research(makePlan(undefined), 'research');
    expect(result.error).toBe('no_ticker');
    expect(result.output).toContain('无 ticker');
    expect(invokeLog.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // valuation (保留旧测试)
  // --------------------------------------------------------------------------

  test('valuation phase calls calculateValuationRatios + calculateDCF', async () => {
    const h = factory();
    const result = await h.valuation(makePlan('AAPL'), 'valuation');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('AAPL');
    expect(result.output).toContain('Valuation Ratios');
    expect(result.output).toContain('DCF');
    expect(invokeLog.some(l => l.startsWith('valuation.'))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // backtest (保留旧测试)
  // --------------------------------------------------------------------------

  test('backtest phase calls backtestLumpSum + generateBacktestReport', async () => {
    const h = factory();
    const result = await h.backtest(makePlan('TSLA'), 'backtest');
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('TSLA');
    expect(result.output).toContain('12 个月');
    expect(result.output).toContain('Mocked Backtest Report');
    expect(invokeLog.some(l => l.includes('backtestLumpSum(TSLA'))).toBe(true);
  });

  // --------------------------------------------------------------------------
  // trade (v7-3 新接通)
  // --------------------------------------------------------------------------

  test('trade without ticker returns no_ticker error', async () => {
    const h = factory();
    const result = await h.trade(makePlan(undefined), 'trade');
    expect(result.error).toBe('no_ticker');
    expect(result.output).toContain('无 ticker');
  });

  test('trade phase loads sandbox + reads quote + places market buy order', async () => {
    const h = factory();
    const result = await h.trade(makePlan('NVDA', '建仓 NVDA'), 'trade');
    expect(result.error).toBeUndefined();
    // 验证:loadState + getPositions + getBalance + getQuote + placeOrder
    expect(invokeLog).toContain('sandbox.loadState()');
    expect(invokeLog).toContain('sandbox.getPositions()');
    expect(invokeLog).toContain('sandbox.getBalance()');
    expect(invokeLog).toContain('sandbox.getQuote(NVDA)');
    expect(invokeLog.some(l => l.startsWith('sandbox.placeOrder') && l.includes('"side":"buy"'))).toBe(true);
    // 验证输出
    expect(result.output).toContain('目标标的');
    expect(result.output).toContain('NVDA');
    expect(result.output).toContain('订单结果');
    expect(result.output).toContain('filled');
  });

  test('trade phase returns hold when position exists and goal has no sell signal', async () => {
    const h = factory();
    // mock 默认 AAPL 已持仓 10 股 — 用 AAPL 当 ticker
    const result = await h.trade(makePlan('AAPL', '继续观察'), 'trade');
    expect(result.output).toContain('持有');
    expect(invokeLog.some(l => l.startsWith('sandbox.placeOrder'))).toBe(false);
  });

  test('trade phase sells existing position when goal contains sell signal', async () => {
    const h = factory();
    const result = await h.trade(makePlan('AAPL', '清仓 AAPL 全部卖出'), 'trade');
    expect(invokeLog.some(l => l.startsWith('sandbox.placeOrder') && l.includes('"side":"sell"'))).toBe(true);
    expect(result.output).toContain('卖出');
    expect(result.output).toContain('订单结果');
  });

  test('trade phase skips sell when no position and no buy signal in goal', async () => {
    const h = factory();
    const result = await h.trade(makePlan('TSLA', '清仓 TSLA'), 'trade');
    expect(result.output).toContain('卖出信号');
    expect(result.output).toContain('无持仓');
    expect(invokeLog.some(l => l.startsWith('sandbox.placeOrder'))).toBe(false);
  });

  // --------------------------------------------------------------------------
  // review (v7-3 新接通 attribution)
  // --------------------------------------------------------------------------

  test('review phase calls sandbox.getPositions + sandbox.getBalance', async () => {
    const h = factory();
    const result = await h.review(makePlan('NVDA'), 'review');
    expect(invokeLog).toContain('sandbox.loadState()');
    expect(invokeLog).toContain('sandbox.getPositions()');
    expect(invokeLog).toContain('sandbox.getBalance()');
    expect(result.output).toContain('持仓总数');
    expect(result.output).toContain('现金余额');
    expect(result.output).toContain('总资产');
  });

  test('review phase calls attribution(combined) when positions exist', async () => {
    const h = factory();
    const result = await h.review(makePlan('NVDA'), 'review');
    expect(invokeLog).toContain('attribution(combined)');
    // 验证三类归因都出现在输出
    expect(result.output).toContain('Brinson 归因');
    expect(result.output).toContain('配置效应');
    expect(result.output).toContain('选择效应');
    expect(result.output).toContain('交互效应');
    expect(result.output).toContain('主动收益');
    expect(result.output).toContain('风格归因');
    expect(result.output).toContain('行业归因');
  });

  test('review phase skips attribution when portfolio is empty', async () => {
    const h = factory();
    // 先 reset mock state 让 portfolio 为空
    const sandboxMod = await import('../../tools/trading/sandbox-engine.js');
    await (sandboxMod as any).__mockSandbox.reset();
    __resetSandboxForTests();

    const result = await h.review(makePlan('NVDA'), 'review');
    expect(result.output).toContain('空组合');
    expect(invokeLog.some(l => l.startsWith('attribution('))).toBe(false);
  });

  test('review without ticker still works (reviews current portfolio)', async () => {
    const h = factory();
    const result = await h.review(makePlan(undefined), 'review');
    // 无 ticker 不影响 review — review 是复盘当前 sandbox 状态
    expect(result.error).toBeUndefined();
    expect(result.output).toContain('持仓总数');
  });

  // --------------------------------------------------------------------------
  // 健壮性
  // --------------------------------------------------------------------------

  test('handlers never throw — failures return { output, error }', async () => {
    const h = factory();
    const r1 = await h.research({ ...makePlan(undefined), ticker: undefined }, 'research');
    expect(r1).toHaveProperty('output');
    expect(r1).toHaveProperty('error');
  });

  test('__resetSandboxForTests causes loadState to be called again on next access', async () => {
    // 第一次调用:创建 sandbox,loadState 被调
    const h1 = factory();
    await h1.trade(makePlan('NVDA', '建仓'), 'trade');
    expect(invokeLog.filter(l => l === 'sandbox.loadState()').length).toBe(1);

    // reset 后,第二次调用应触发新的 loadState
    __resetSandboxForTests();
    const h2 = factory();
    await h2.review(makePlan('NVDA'), 'review');
    expect(invokeLog.filter(l => l === 'sandbox.loadState()').length).toBe(2);
  });
});
