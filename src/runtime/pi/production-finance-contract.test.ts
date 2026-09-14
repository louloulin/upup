import { describe, expect, test } from 'bun:test';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const requiredFinancialTools = [
  'get_market_data', 'get_financials', 'read_filings', 'get_astock_price', 'get_astock_financials',
  'get_astock_news', 'fund_search', 'fund_detail', 'dcf_model', 'ddm_model',
  'peer_comparison', 'calculate_target_price', 'calculate_technical_indicators', 'run_backtest',
  'portfolio_attribution', 'calculate_var', 'place_trade_order', 'cancel_trade_order',
] as const;

const packageNames = [
  '@upup/pi-finance-sdk',
  '@upup/pi-market-data',
  '@upup/pi-investment-analysis',
  '@upup/pi-risk',
  '@upup/pi-portfolio',
  '@upup/pi-backtest',
] as const;

async function createProductionSession(tools: readonly string[]) {
  return new PiAgentSessionFactory().createSession({
    ...getInvestmentAgentSpec('invest-review'),
    packages: packageNames,
    skills: [],
    tools,
  }, { cwd: process.cwd() });
}

describe('production finance Pi adapter contract', () => {
  test('exposes required market, valuation, quant, portfolio, risk and trading tools through Pi Packages', async () => {
    const session = await createProductionSession(requiredFinancialTools);
    try {
      const available = new Set(session.getAvailableToolNames());
      for (const name of requiredFinancialTools) expect(available.has(name)).toBe(true);
    } finally {
      session.dispose();
    }
  });

  test('runs a real native risk adapter through Pi with auditable evidence', async () => {
    const session = await createProductionSession(['calculate_var']);
    try {
      const result = await session.executeTool('calculate_var', 'production-finance-contract', {
        returns: [0.01, -0.02, 0.015, -0.005, 0.008], confidence: 0.95, method: 'historical',
      });
      expect(result.details).toMatchObject({
        auditId: 'production-finance-contract',
        dataFreshness: expect.any(String),
        evidence: [expect.objectContaining({
          retrievedAt: expect.any(String),
          asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        })],
      });
      expect((result.content[0] as { type: string; text?: string }).text).not.toContain('undefined');
    } finally {
      session.dispose();
    }
  });

  test('Pi session denies production trading without approval', async () => {
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-trade'),
      packages: ['@upup/pi-finance-sdk'],
      skills: [],
      tools: ['place_trade_order'],
    }, { cwd: process.cwd() });
    try {
      const result = await session.executeTool('place_trade_order', 'production-order-denied', {
        symbol: '600519.SH', side: 'buy', quantity: 1, type: 'market',
      }) as { isError?: boolean; details?: { policyAudit?: { decision?: string } } };
      expect(result.isError).toBe(true);
      expect(result.details?.policyAudit?.decision).toBe('denied');
    } finally {
      session.dispose();
    }
  });

  test('loads and executes native strategy tools through the invest-trade Pi profile', async () => {
    const strategyTools = ['strategy_list', 'strategy_backtest', 'strategy_run_paper'] as const;
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-trade'),
      packages: ['@upup/pi-finance-sdk'],
      skills: [],
      tools: [...strategyTools],
    }, { cwd: process.cwd() });
    try {
      expect(new Set(session.getAvailableToolNames())).toEqual(new Set(strategyTools));

      const listed = await session.executeTool('strategy_list', 'production-strategy-list', { limit: 4 });
      expect(listed).toMatchObject({
        details: {
          auditId: 'production-strategy-list',
          evidence: [expect.objectContaining({ source: 'upup-pi://finance-sdk/strategy-list' })],
        },
      });
      expect(JSON.parse((listed.content[0] as { type: string; text: string }).text).value).toHaveLength(4);

      const backtest = await session.executeTool('strategy_backtest', 'production-strategy-backtest', {
        algo: 'twap',
        symbol: '600519.SH',
        side: 'buy',
        quantity: 1000,
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        bars: [
          { date: '2026-05-01', close: 100, volume: 10000 },
          { date: '2026-05-04', close: 101, volume: 12000 },
          { date: '2026-05-05', close: 102, volume: 11000 },
        ],
      });
      expect(backtest).toMatchObject({
        details: {
          auditId: 'production-strategy-backtest',
          evidence: [expect.objectContaining({
            source: 'upup-pi://finance-sdk/strategy-backtest',
            freshness: 'historical',
          })],
        },
      });
      expect(JSON.parse((backtest.content[0] as { type: string; text: string }).text).value).toMatchObject({
        status: 'completed',
        dataSource: 'caller-provided-historical-bars',
        algo: 'twap',
        symbol: '600519.SH',
      });

      const denied = await session.executeTool('strategy_run_paper', 'production-strategy-denied', {
        algo: 'twap',
        symbol: '600519.SH',
        side: 'buy',
        quantity: 100,
        durationMinutes: 1,
      }) as { isError?: boolean; details?: { policyAudit?: { decision?: string } } };
      expect(denied.isError).toBe(true);
      expect(denied.details?.policyAudit?.decision).toBe('denied');
    } finally {
      session.dispose();
    }
  });

  test('executes production valuation, technical, backtest, portfolio, and risk tools through Pi', async () => {
    const tools = ['dcf_model', 'ddm_model', 'peer_comparison', 'calculate_technical_indicators', 'run_backtest', 'portfolio_attribution', 'calculate_var'] as const;
    const session = await createProductionSession(tools);
    try {
      const bars = Array.from({ length: 20 }, (_, index) => ({
        date: `2026-08-${String(index + 1).padStart(2, '0')}`,
        open: 100 + index,
        high: 102 + index,
        low: 99 + index,
        close: 101 + index,
        volume: 1_000_000 + index * 10_000,
      }));
      const inputs: Record<string, unknown> = {
        dcf_model: { current_fcf: 1_000_000, growth_rate: 0.08, discount_rate: 0.1, terminal_growth_rate: 0.03, projection_years: 5, shares_outstanding: 100_000 },
        ddm_model: { symbol: '0700.HK', current_dividend: 2, growth_rate: 0.04, required_return: 0.1, terminal_growth_rate: 0.03, projection_years: 5 },
        peer_comparison: { target: { name: 'Target', pe_ratio: 18, pb_ratio: 2, roe: 0.15 }, peers: [{ name: 'Peer A', pe_ratio: 20, pb_ratio: 2.2, roe: 0.14 }, { name: 'Peer B', pe_ratio: 16, pb_ratio: 1.8, roe: 0.16 }] },
        calculate_technical_indicators: { data: bars, indicators: ['kdj', 'boll', 'atr'] },
        run_backtest: { trades: [{ symbol: 'AAPL', analysisDate: '2026-01-01', operationAdvice: '买入', entryPrice: 100, quantity: 10 }], forwardPriceData: { AAPL: [{ date: '2026-01-02', close: 105 }] }, evalWindowDays: 1, neutralBandPct: 2 },
        portfolio_attribution: { method: 'combined', portfolio: { totalReturn: 0.12, holdings: [{ sector: '科技', weight: 1, return: 0.12 }] }, benchmark: { totalReturn: 0.1, holdings: [{ sector: '科技', weight: 1, return: 0.1 }] } },
        calculate_var: { returns: [0.01, -0.02, 0.015, -0.005, 0.008], confidence: 0.95, method: 'historical' },
      };
      for (const name of tools) {
        const result = await session.executeTool(name, `behavior-${name}`, inputs[name]);
        expect(result.content[0]).toMatchObject({ type: 'text' });
        expect(result.details).toMatchObject({
          auditId: `behavior-${name}`,
          evidence: [expect.objectContaining({ source: expect.any(String), retrievedAt: expect.any(String) })],
        });
      }
    } finally {
      session.dispose();
    }
  });

  test('loads research deep-search and investment matrix only from their Pi Packages', async () => {
    const research = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-research'], skills: [], tools: ['research_deep_search'],
    }, { cwd: process.cwd() });
    const analysis = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'), packages: ['@upup/pi-investment-analysis'], skills: [], tools: ['matrix_analysis'],
    }, { cwd: process.cwd() });
    try {
      expect(research.getAvailableToolNames()).toEqual(['research_deep_search']);
      expect(analysis.getAvailableToolNames()).toEqual(['matrix_analysis']);
      const deep = await research.executeTool('research_deep_search', 'production-deep-search', {
        query: 'AAPL growth',
        documents: [{ id: 'doc-1', source: 'fixture://research', title: 'AAPL outlook', kind: 'broker_research', content: 'Apple beat earnings and raised guidance for growth.', tickers: ['AAPL'] }],
      });
      expect(JSON.parse((deep.content[0] as { type: string; text: string }).text)).toMatchObject({ query: 'AAPL growth', corpusSize: 1 });
      expect(deep.details).toMatchObject({ auditId: 'production-deep-search', evidence: [expect.objectContaining({ source: 'upup-pi://research/deep-search' })] });
      const matrix = await analysis.executeTool('matrix_analysis', 'production-matrix', {
        tickers: ['AAPL'], dimensions: ['technical'], cells: [{ ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 25 }, polarity: 0.7, confidence: 0.9 }],
      });
      expect(JSON.parse((matrix.content[0] as { type: string; text: string }).text)).toMatchObject({ summary: { totalPopulated: 1 } });
      expect(matrix.details).toMatchObject({ auditId: 'production-matrix', evidence: [expect.objectContaining({ source: 'upup-pi://investment-analysis/matrix' })] });
    } finally {
      research.dispose();
      analysis.dispose();
    }
  });

  test('executes stock_analysis through a real Pi Package and Platform worker bridge', async () => {
    const faux = fauxProvider({ provider: 'upup-stock-analysis-contract', models: [{ id: 'stock-analysis-contract-model' }] });
    faux.setResponses([
      fauxAssistantMessage([fauxText('基本面研究完成：业务、行业和治理证据已整理。')]),
      fauxAssistantMessage([fauxText('财务分析完成：盈利、现金流和估值证据已整理。')]),
      fauxAssistantMessage([fauxText('综合建议：保持观察，继续验证关键假设与风险。')]),
    ]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const sessionDir = await mkdtemp(join(process.cwd(), '.upup', 'stock-analysis-contract-'));
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      id: 'stock-analysis-contract',
      packages: ['@upup/pi-investment-analysis', '@upup/pi-platform'],
      skills: [],
      tools: ['stock_analysis'],
      model: faux.getModel().id,
    }, { cwd: process.cwd(), sessionDir, model: faux.getModel(), modelRuntime });
    try {
      expect(session.getAvailableToolNames()).toEqual(['stock_analysis']);
      const result = await session.executeTool('stock_analysis', 'production-stock-analysis', { symbol: '600519.SH', name: '贵州茅台', depth: 'basic' });
      expect(result).toMatchObject({ details: { auditId: 'production-stock-analysis', journal: 'pi-session', dataFreshness: 'live', evidence: [expect.objectContaining({ source: 'upup-pi://investment-analysis/stock-analysis' })] } });
      const report = JSON.parse((result.content[0] as { type: string; text: string }).text) as { symbol: string; success: boolean; researcherReport: string; analystReport: string; recommendation: string };
      expect(report).toMatchObject({ symbol: '600519.SH', success: true, recommendation: '综合建议：保持观察，继续验证关键假设与风险。' });
      expect(new Set([report.researcherReport, report.analystReport])).toEqual(new Set(['基本面研究完成：业务、行业和治理证据已整理。', '财务分析完成：盈利、现金流和估值证据已整理。']));
      expect(session.getCustomEntries('upup_pi_stock_analysis')).toHaveLength(1);
    } finally {
      session.dispose();
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
});
