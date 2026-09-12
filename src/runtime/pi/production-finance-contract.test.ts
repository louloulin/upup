import { describe, expect, test } from 'bun:test';
import { getToolRegistry } from '../../tools/registry/index.js';
import { registeredToolToPiContract } from './registry-adapter.js';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import type { UpUpToolContract } from './types.js';

const requiredFinancialTools = [
  'get_market_data', 'get_financials', 'read_filings', 'get_astock_price', 'get_astock_financials',
  'get_astock_news', 'fund_search', 'fund_detail', 'web_fetch', 'dcf_model', 'ddm_model',
  'peer_comparison', 'calculate_target_price', 'calculate_technical_indicators', 'run_backtest',
  'portfolio_attribution', 'calculate_var', 'place_trade_order', 'cancel_trade_order',
] as const;

describe('production finance Pi adapter contract', () => {
  test('exposes required market, valuation, quant, portfolio, risk and trading tools', async () => {
    const registered = await getToolRegistry('deepseek-v4-flash');
    const byName = new Map(registered.map((tool) => [tool.name, tool]));
    expect(requiredFinancialTools.every((name) => byName.has(name))).toBe(true);
    for (const name of requiredFinancialTools) {
      const tool = byName.get(name);
      if (!tool) continue;
      const contract = registeredToolToPiContract(tool);
      expect(contract.parameters).toBeDefined();
      expect(contract.maxConcurrent).toBeGreaterThan(0);
      expect(['safe', 'warning', 'dangerous', 'critical']).toContain(contract.safetyLevel);
      if (name === 'place_trade_order' || name === 'cancel_trade_order') {
        expect(contract.safetyLevel).toBe('dangerous');
        expect(contract.hasFinancialImpact).toBe(true);
      }
    }
  });

  test('runs a real registry-shaped read adapter through Pi with auditable evidence', async () => {
    const registered = await getToolRegistry('deepseek-v4-flash');
    const source = registered.find((tool) => tool.name === 'calculate_var');
    expect(source).toBeDefined();
    const contract = registeredToolToPiContract(source!);
    const spec = getInvestmentAgentSpec('invest-risk');
    const result = await contract.execute({ returns: [0.01, -0.02, 0.015, -0.005, 0.008], confidence: 0.95, method: 'historical' }, {
      signal: new AbortController().signal,
      agent: spec,
      toolCallId: 'production-finance-contract',
      auditId: 'production-finance-audit',
    });
    expect(result.details).toMatchObject({
      auditId: 'production-finance-audit',
      dataFreshness: expect.any(String),
      evidence: [expect.objectContaining({
        id: 'production-finance-audit:evidence:0',
        retrievedAt: expect.any(String),
        asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      })],
    });
    expect(result.text).not.toContain('undefined');
  });

  test('Pi session denies production trading without approval', async () => {
    const registered = await getToolRegistry('deepseek-v4-flash');
    const order = registered.find((tool) => tool.name === 'place_trade_order');
    expect(order).toBeDefined();
    const contract = registeredToolToPiContract(order!);
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-trade'),
      tools: ['place_trade_order'],
    }, { cwd: process.cwd(), tools: [contract] });
    try {
      const result = await session.executeTool('place_trade_order', 'production-order-denied', {
        symbol: '600519.SH', side: 'buy', quantity: 1, type: 'market',
      }) as { isError?: boolean; details?: { policyAudit?: { decision?: string } } };
      expect(result.isError).toBe(true);
      expect(result.details?.policyAudit?.decision).toBe('approval_denied');
    } finally {
      session.dispose();
    }
  });

  test('executes production valuation, technical, backtest, portfolio, and risk tools through Pi', async () => {
    const registered = await getToolRegistry('deepseek-v4-flash');
    const byName = new Map(registered.map((tool) => [tool.name, tool]));
    const bars = Array.from({ length: 20 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 1_000_000 + index * 10_000,
    }));
    const inputs: Record<string, unknown> = {
      dcf_model: {
        current_fcf: 1_000_000,
        growth_rate: 0.08,
        discount_rate: 0.1,
        terminal_growth_rate: 0.03,
        projection_years: 5,
        shares_outstanding: 100_000,
      },
      ddm_model: {
        symbol: '0700.HK',
        current_dividend: 2,
        growth_rate: 0.04,
        required_return: 0.1,
        terminal_growth_rate: 0.03,
        projection_years: 5,
      },
      peer_comparison: {
        target: { name: 'Target', pe: 18, pb: 2, roe: 0.15 },
        peers: [{ name: 'Peer A', pe: 20, pb: 2.2, roe: 0.14 }, { name: 'Peer B', pe: 16, pb: 1.8, roe: 0.16 }],
      },
      calculate_technical_indicators: { data: bars, indicators: ['kdj', 'boll', 'atr'] },
      run_backtest: {
        trades: [{ symbol: 'AAPL', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 10 }],
        forwardPriceData: { AAPL: [{ date: '2026-01-02', close: 105 }] },
        evalWindowDays: 1,
        neutralBandPct: 2,
      },
      portfolio_attribution: {
        method: 'combined',
        portfolio: { totalReturn: 0.12, holdings: [{ sector: '科技', weight: 1, return: 0.12 }] },
        benchmark: { totalReturn: 0.1, holdings: [{ sector: '科技', weight: 1, return: 0.1 }] },
      },
      calculate_var: { returns: [0.01, -0.02, 0.015, -0.005, 0.008], confidence: 0.95, method: 'historical' },
    };
    for (const name of Object.keys(inputs)) {
      const source = byName.get(name);
      expect(source).toBeDefined();
      const contract = registeredToolToPiContract(source!);
      const result = await contract.execute(inputs[name], {
        signal: new AbortController().signal,
        agent: getInvestmentAgentSpec('invest-review'),
        toolCallId: `behavior-${name}`,
        auditId: `behavior-audit-${name}`,
      });
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.details).toMatchObject({
        auditId: `behavior-audit-${name}`,
        evidence: [expect.objectContaining({ source: expect.any(String), retrievedAt: expect.any(String) })],
      });
    }
  });
});
