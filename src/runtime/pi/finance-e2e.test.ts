import { describe, expect, test } from 'bun:test';
import { Type, type TSchema } from 'typebox';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import type { UpUpAgentSession, UpUpToolContract } from './types.js';

const symbolParameters = Type.Object({ symbol: Type.String() });
const portfolioParameters = Type.Object({ portfolio: Type.String() });
const backtestParameters = Type.Object({ trades: Type.Array(Type.Object({ symbol: Type.String() })), forwardPriceData: Type.Record(Type.String(), Type.Array(Type.Object({ date: Type.String() }))), evalWindowDays: Type.Number(), neutralBandPct: Type.Number() });

function financeFixture(
  name: string,
  value: unknown,
  parameters: TSchema = symbolParameters,
  safetyLevel: UpUpToolContract['safetyLevel'] = 'safe',
): UpUpToolContract {
  return {
    name,
    label: name,
    description: `Deterministic local fixture for ${name}.`,
    category: name.includes('var') ? 'risk' : name.includes('trade') || name.includes('order') ? 'trading' : 'finance',
    safetyLevel,
    parameters,
    hasFinancialImpact: safetyLevel === 'dangerous' || safetyLevel === 'critical',
    async execute(_input, context) {
      return {
        value,
        text: JSON.stringify(value),
        details: {
          evidence: [{
            id: `fixture-${name}`,
            source: `upup-fixture://finance/${name}`,
            retrievedAt: '2026-09-13T00:00:00.000Z',
            asOf: '2026-09-12',
            query: name,
            dataHash: 'a'.repeat(64),
            confidence: 'high',
          }],
          dataFreshness: name.includes('backtest') ? 'historical' : 'offline',
          warnings: ['Deterministic fixture data; no external network or broker was contacted.'],
          auditId: context.auditId,
        },
      };
    },
  };
}

describe('Pi financial domain behavior', () => {
  test('executes cross-market, valuation, quant, and portfolio capabilities through Pi tools', async () => {
    const tools = [
      financeFixture('get_astock_price', { market: 'cn', symbol: '600519.SH', close: 1500 }),
      financeFixture('get_market_data', { market: 'us', symbol: 'AAPL', close: 225 }),
      financeFixture('fund_detail', { market: 'fund', symbol: '110011', nav: 2.4 }),
      financeFixture('read_filings', { market: 'hk', symbol: '0700.HK', period: '2025-12-31' }),
      financeFixture('dcf_model', { intrinsicValue: 180, terminalGrowth: 0.03 }),
      financeFixture('ddm_model', { targetPrice: 42, terminalGrowth: 0.03 }),
      financeFixture('calculate_target_price', { targetPrice: 195, method: 'comparable' }),
      financeFixture('calculate_technical_indicators', { rsi: 54, macd: 1.2 }),
      financeFixture('run_backtest', { annualizedReturn: 0.12, maxDrawdown: -0.08 }, backtestParameters),
      financeFixture('portfolio_attribution', { activeReturn: 0.02, allocation: 0.01, selection: 0.008 }),
      financeFixture('calculate_var', { confidence: 0.95, var: 0.035 }, Type.Object({ returns: Type.Array(Type.Number()) })),
    ];
    const names = tools.map((tool) => tool.name);
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      id: 'invest-finance-e2e',
      packages: [],
      skills: [],
      tools: names,
    }, { cwd: process.cwd(), tools });
    try {
      for (const tool of tools) {
        const input = tool.name === 'run_backtest'
          ? { trades: [{ symbol: 'A', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 1 }], forwardPriceData: { A: [{ date: '2026-01-02', high: 105, low: 99, close: 104 }] }, evalWindowDays: 1, neutralBandPct: 2 }
          : tool.name === 'calculate_var'
            ? { returns: [0.01, -0.02, 0.015, -0.005, 0.008] }
          : tool.name === 'get_market_data'
            ? { query: 'AAPL price' }
          : tool.name === 'get_astock_price'
            ? { code: '600519.SH' }
          : tool.name === 'dcf_model'
            ? { current_fcf: 100, growth_rate: 0.08, discount_rate: 0.1, terminal_growth_rate: 0.03, projection_years: 5, shares_outstanding: 10 }
          : tool.name === 'calculate_target_price'
            ? { symbol: 'AAPL', currentPrice: 150, method: 'pe', currentEps: 6, forwardEps: 7, targetPe: 25, peYears: 3 }
          : tool.name === 'ddm_model'
            ? { symbol: '600519.SH', current_dividend: 2, growth_rate: 0.05, required_return: 0.1, terminal_growth_rate: 0.03, projection_years: 5, current_price: 30 }
          : tool.name === 'calculate_target_price'
            ? { source: 'upup-pi://investment-analysis/target-price' }
          : tool.name === 'calculate_technical_indicators'
            ? { data: Array.from({ length: 25 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000 + index * 10 })), indicators: ['kdj', 'boll', 'atr'] }
          : tool.name === 'portfolio_attribution'
            ? { method: 'combined', portfolio: { totalReturn: 0.1, holdings: [{ sector: 'Technology', weight: 1, return: 0.1 }] }, benchmark: { totalReturn: 0.08, holdings: [{ sector: 'Technology', weight: 1, return: 0.08 }] } }
          : { symbol: tool.name === 'get_market_data' ? 'AAPL' : '600519.SH' };
        const result = await session.executeTool(tool.name, `e2e-${tool.name}`, input) as Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };
        expect(result.isError).not.toBe(true);
        const expectedEvidence = { source: `upup-fixture://finance/${tool.name}`, dataHash: 'a'.repeat(64) };
        expect(result.details).toMatchObject({
          auditId: expect.any(String),
          dataFreshness: expect.any(String),
          evidence: [expect.objectContaining(expectedEvidence)],
        });
      }
    } finally {
      session.dispose();
    }
  });

  test('keeps real registry-shaped simulated trading behind per-call approval', async () => {
    let executions = 0;
    const order = financeFixture(
      'place_trade_order',
      { status: 'simulated', orderId: 'paper-1' },
      Type.Object({ symbol: Type.String(), side: Type.String(), quantity: Type.Number() }),
      'dangerous',
    );
    order.execute = async (_input, context) => {
      executions += 1;
      return {
        value: { status: 'simulated', orderId: 'paper-1' },
        text: 'simulated order paper-1',
        details: { evidence: [], dataFreshness: 'offline', auditId: context.auditId },
      };
    };
    const spec = { ...getInvestmentAgentSpec('invest-trade'), packages: [], skills: [], tools: ['place_trade_order'] };
    const denied = await new PiAgentSessionFactory().createSession(spec, {
      cwd: process.cwd(),
      tools: [order],
    });
    try {
      const result = await denied.executeTool('place_trade_order', 'paper-denied', { symbol: '600519.SH', side: 'buy', quantity: 100 }) as Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };
      expect(result.isError).toBe(true);
      expect((result.details as { policyAudit?: { decision?: string } }).policyAudit?.decision).toBe('approval_denied');
      expect(executions).toBe(0);
    } finally {
      denied.dispose();
    }

    const approved = await new PiAgentSessionFactory().createSession(spec, {
      cwd: process.cwd(),
      tools: [order],
      requestToolApproval: async () => true,
    });
    try {
      const result = await approved.executeTool('place_trade_order', 'paper-approved', { symbol: '600519.SH', side: 'buy', quantity: 100 }) as Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };
      expect(result.isError).not.toBe(true);
      expect(executions).toBe(1);
    } finally {
      approved.dispose();
    }
  });
});
