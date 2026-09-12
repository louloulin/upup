import { describe, expect, test } from 'bun:test';
import { Type, type TSchema } from 'typebox';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';
import type { UpUpAgentSession, UpUpToolContract } from './types.js';

const symbolParameters = Type.Object({ symbol: Type.String() });
const portfolioParameters = Type.Object({ portfolio: Type.String() });

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
      financeFixture('run_backtest', { annualizedReturn: 0.12, maxDrawdown: -0.08 }, portfolioParameters),
      financeFixture('portfolio_attribution', { activeReturn: 0.02, allocation: 0.01, selection: 0.008 }),
      financeFixture('calculate_var', { confidence: 0.95, var: 0.035 }, portfolioParameters),
    ];
    const names = tools.map((tool) => tool.name);
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      id: 'invest-finance-e2e',
      tools: names,
    }, { cwd: process.cwd(), tools });
    try {
      for (const tool of tools) {
        const input = tool.name === 'run_backtest' || tool.name === 'calculate_var'
          ? { portfolio: 'fixture-portfolio' }
          : { symbol: tool.name === 'get_market_data' ? 'AAPL' : '600519.SH' };
        const result = await session.executeTool(tool.name, `e2e-${tool.name}`, input) as Awaited<ReturnType<UpUpAgentSession['executeTool']>> & { isError?: boolean };
        expect(result.isError).not.toBe(true);
        expect(result.details).toMatchObject({
          auditId: expect.any(String),
          dataFreshness: expect.any(String),
          evidence: [expect.objectContaining({
            source: `upup-fixture://finance/${tool.name}`,
            dataHash: 'a'.repeat(64),
          })],
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
    const spec = { ...getInvestmentAgentSpec('invest-trade'), tools: ['place_trade_order'] };
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
