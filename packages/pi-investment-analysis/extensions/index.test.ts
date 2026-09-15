import { describe, expect, test } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { publishPiCapabilityHosts } from '@upup/pi-capability-registry';
import investmentAnalysisExtension from './index';

describe('Pi investment-analysis extension', () => {
  const extension = (registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => void) => investmentAnalysisExtension({ events: createEventBus(), registerTool } as never);
  test('registers auditable DCF and technical tools', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    extension((tool) => tools.set(tool.name, tool));
    expect([...tools.keys()]).toEqual(['matrix_analysis', 'stock_analysis', 'analyze_symbol', 'list_research_tasks', 'dcf_model', 'valuation_ratios', 'peer_comparison', 'calculate_target_price', 'quick_target_price', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'decision_dashboard', 'ddm_model', 'investment_dcf', 'investment_technical_signal']);
    const productionDcf = await tools.get('dcf_model')!.execute('dcf-native-1', { current_fcf: 100, growth_rate: 0.08, discount_rate: 0.1, terminal_growth_rate: 0.03, projection_years: 5, shares_outstanding: 10 }, new AbortController().signal);
    expect(JSON.parse(productionDcf.content[0].text)).toMatchObject({ shares_outstanding: 10, assumptions: { projection_years: 5 } });
    expect(productionDcf.details).toMatchObject({ auditId: 'dcf-native-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://investment-analysis/dcf' }] });
    const productionDdm = await tools.get('ddm_model')!.execute('ddm-native-1', { symbol: '600519.SH', current_dividend: 2, growth_rate: 0.05, required_return: 0.1, terminal_growth_rate: 0.03, projection_years: 5, current_price: 30 }, new AbortController().signal);
    expect(JSON.parse(productionDdm.content[0].text)).toMatchObject({ symbol: '600519.SH', assumptions: { projection_years: 5 } });
    expect(productionDdm.details).toMatchObject({ auditId: 'ddm-native-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://investment-analysis/ddm' }] });
    const matrix = await tools.get('matrix_analysis')!.execute('matrix-native-1', { tickers: ['AAPL'], dimensions: ['technical'], cells: [{ ticker: 'AAPL', dimension: 'technical', metrics: { rsi: 25 }, polarity: 0.7, confidence: 0.9 }] }, new AbortController().signal);
    expect(JSON.parse(matrix.content[0].text)).toMatchObject({ spec: { tickers: ['AAPL'], dimensions: ['technical'] }, summary: { totalPopulated: 1 } });
    expect(matrix.details).toMatchObject({ auditId: 'matrix-native-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://investment-analysis/matrix' }] });
    const ratios = await tools.get('valuation_ratios')!.execute('ratios-native-1', { price: 150, eps: 10, shares_outstanding: 10, total_equity: 500, operating_cash_flow: 80 }, new AbortController().signal);
    expect(JSON.parse(ratios.content[0].text)).toMatchObject({ pe_ratio: 15, pb_ratio: 3, pcf_ratio: 18.75 });
    expect(ratios.details).toMatchObject({ auditId: 'ratios-native-1', evidence: [{ source: 'upup-pi://investment-analysis/valuation-ratios' }] });
    const peers = await tools.get('peer_comparison')!.execute('peers-native-1', { target: { name: 'Target', pe_ratio: 18 }, peers: [{ name: 'A', pe_ratio: 20 }, { name: 'B', pe_ratio: 16 }] }, new AbortController().signal);
    expect(JSON.parse(peers.content[0].text).metrics.pe_ratio).toMatchObject({ peer_avg: 18, percentile: 50 });
    const targetPrice = await tools.get('calculate_target_price')!.execute('target-native-1', { symbol: 'AAPL', currentPrice: 150, method: 'pe', currentEps: 6, forwardEps: 7, targetPe: 25, peYears: 3 }, new AbortController().signal);
    expect(JSON.parse(targetPrice.content[0].text)).toMatchObject({ targetPrice: 175, method: 'pe' });
    expect(targetPrice.details).toMatchObject({ auditId: 'target-native-1', evidence: [{ source: 'upup-pi://investment-analysis/target-price' }] });
    const dcf = await tools.get('investment_dcf')!.execute('dcf-1', { currentFcf: 100, growthRate: 0.08, discountRate: 0.1, terminalGrowthRate: 0.03, projectionYears: 5, sharesOutstanding: 10 }, new AbortController().signal);
    expect(JSON.parse(dcf.content[0].text)).toHaveProperty('fairValuePerShare');
    expect(dcf.details).toMatchObject({ auditId: 'dcf-1', dataFreshness: 'historical', evidence: [{ source: 'upup-fixture://investment-analysis/dcf' }] });
    const option = await tools.get('calculate_option_price')!.execute('option-native-1', { spotPrice: 100, strikePrice: 100, timeToExpiry: 180, riskFreeRate: 0.05, volatility: 0.25, optionType: 'call' }, new AbortController().signal);
    const optionPrice = JSON.parse(option.content[0].text);
    expect(optionPrice.price).toBeGreaterThan(0);
    expect(optionPrice.gamma).toBeGreaterThan(0);
    expect(option.details).toMatchObject({ auditId: 'option-native-1', evidence: [{ source: 'upup-pi://investment-analysis/option-price' }] });
    const greeks = await tools.get('calculate_option_greeks')!.execute('greeks-native-1', { spotPrice: 100, strikePrice: 100, timeToExpiry: 180, riskFreeRate: 0.05, volatility: 0.25, optionType: 'call' }, new AbortController().signal);
    expect(JSON.parse(greeks.content[0].text)).toMatchObject({ delta: expect.any(Number), vega: expect.any(Number) });
    const implied = await tools.get('calculate_implied_volatility')!.execute('iv-native-1', { marketPrice: optionPrice.price, spotPrice: 100, strikePrice: 100, timeToExpiry: 180, riskFreeRate: 0.05, optionType: 'call' }, new AbortController().signal);
    expect(JSON.parse(implied.content[0].text).impliedVolatility).toBeCloseTo(0.25, 2);
    expect(implied.details).toMatchObject({ auditId: 'iv-native-1', evidence: [{ source: 'upup-pi://investment-analysis/implied-volatility' }] });
    const bars = Array.from({ length: 25 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 1000 + index * 10 }));
    const indicators = await tools.get('calculate_technical_indicators')!.execute('technical-native-1', { data: bars }, new AbortController().signal);
    expect(JSON.parse(indicators.content[0].text)).toMatchObject({ dataPoints: 25, indicatorsCalculated: 6 });
    expect(indicators.details).toMatchObject({ auditId: 'technical-native-1', evidence: [{ source: 'upup-pi://investment-analysis/technical-indicators' }] });
    const kdj = await tools.get('calculate_kdj')!.execute('kdj-native-1', { data: bars }, new AbortController().signal);
    expect(JSON.parse(kdj.content[0].text)).toMatchObject({ indicator: 'KDJ' });
    const boll = await tools.get('calculate_boll')!.execute('boll-native-1', { data: bars }, new AbortController().signal);
    expect(JSON.parse(boll.content[0].text)).toMatchObject({ indicator: 'BOLL' });
    for (const [toolName, indicator, source] of [
      ['calculate_wr', 'WR', 'upup-pi://investment-analysis/wr'],
      ['calculate_cci', 'CCI', 'upup-pi://investment-analysis/cci'],
      ['calculate_atr', 'ATR', 'upup-pi://investment-analysis/atr'],
      ['calculate_obv', 'OBV', 'upup-pi://investment-analysis/obv'],
    ] as const) {
      const result = await tools.get(toolName)!.execute(`${toolName}-native-1`, { data: bars }, new AbortController().signal);
      expect(JSON.parse(result.content[0].text)).toMatchObject({ indicator });
      expect(result.details).toMatchObject({ auditId: `${toolName}-native-1`, evidence: [{ source }] });
    }
    const dashboard = await tools.get('decision_dashboard')!.execute('dashboard-native-1', {
      symbol: 'AAPL', technical: { trend: 'uptrend', rsi: 45, macd_signal: 'bullish' },
      fundamental: { pe_ratio: 12, roe: 0.22 }, sentiment: { news_sentiment: 'positive', analyst_rating: 'buy' },
      risk: { volatility: 0.1, beta: 0.7 },
    }, new AbortController().signal);
    expect(JSON.parse(dashboard.content[0].text)).toMatchObject({ symbol: 'AAPL', signal: 'BUY', dimensions: expect.any(Array) });
    expect(dashboard.details).toMatchObject({ auditId: 'dashboard-native-1', evidence: [{ source: 'upup-pi://investment-analysis/decision-dashboard' }] });
  });

  test('fails closed without a runtime research-worker capability', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    extension((tool) => tools.set(tool.name, tool));
    const result = await tools.get('analyze_symbol')!.execute('analyze-denied', { symbol: 'AAPL', question: '是否值得买入？' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ capability: 'research-worker', policy: 'fail-closed' });
  });

  test('fails closed without the Platform agent-worker capability', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    extension((tool) => tools.set(tool.name, tool));
    const result = await tools.get('stock_analysis')!.execute('stock-analysis-denied', { symbol: 'AAPL', name: 'Apple' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ capability: 'agent-worker', policy: 'fail-closed' });
  });

  test('runs stock analysis through the exact Platform agent-worker host and journals the result', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const entries: unknown[] = [];
    const events = createEventBus();
    const dispose = publishPiCapabilityHosts(events, 'session-stock', new Map([['@upup/pi-platform', {
      packageName: '@upup/pi-platform', packageVersion: '0.1.0', sessionId: 'session-stock', capabilities: ['agent-worker'],
      providers: { workers: { runAgentWorker: async (request: any) => ({ agentId: request.agentId, output: `worker:${request.role}`, sessionId: `session:${request.agentId}` }) } },
    }]]));
    investmentAnalysisExtension({ events, registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('stock_analysis')!.execute('stock-analysis-1', { symbol: 'AAPL', name: 'Apple', depth: 'basic' }, new AbortController().signal, undefined, { sessionManager: { appendCustomEntry: (_type: string, data: unknown) => entries.push(data), getEntries: () => [] } });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ symbol: 'AAPL', success: true, recommendation: 'worker:portfolio-advisor' });
    expect(result.details).toMatchObject({ auditId: 'stock-analysis-1', journal: 'pi-session', dataFreshness: 'live' });
    expect(entries).toHaveLength(1);
    dispose();
  });

  test('uses the exact session-scoped runtime worker and persists task journal', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const entries: unknown[] = [];
    const events = createEventBus();
    const dispose = publishPiCapabilityHosts(events, 'session-a', new Map([['@upup/pi-investment-analysis', {
      packageName: '@upup/pi-investment-analysis', packageVersion: '0.1.0', sessionId: 'session-a', capabilities: ['research-worker'],
      providers: { workers: { runResearchWorker: async (request: any) => ({ role: request.role, output: `finding:${request.symbol}`, evidence: [{ source: 'fixture' }], sessionId: `worker:${request.role}` }) } },
    }]]));
    investmentAnalysisExtension({ events, registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('analyze_symbol')!.execute('analyze-1', { symbol: 'AAPL', question: '分析' }, new AbortController().signal, undefined, { sessionManager: { appendCustomEntry: (_type: string, data: unknown) => entries.push(data), getEntries: () => [] } });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text).workers).toHaveLength(4);
    expect(entries).toHaveLength(1);
    dispose();
  });

  test('reads the Pi session research journal with evidence and filters', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    extension((tool) => tools.set(tool.name, tool));
    const context = { sessionManager: { getEntries: () => [{ type: 'custom', customType: 'upup_pi_research_tasks', data: { schema: 1, tasks: [{ id: 'task-1', title: 'AAPL research', phase: 'research', status: 'completed', createdAt: 1, updatedAt: 2 }, { id: 'task-2', title: 'AAPL verify', phase: 'verification', status: 'failed', createdAt: 1, updatedAt: 3 }] } }] } };
    const result = await tools.get('list_research_tasks')!.execute('research-journal-1', { phase: 'verification' }, new AbortController().signal, undefined, context);
    expect(JSON.parse(result.content[0].text).tasks).toHaveLength(1);
    expect(result.details).toMatchObject({ auditId: 'research-journal-1', journal: 'pi-session', evidence: [{ source: 'upup-pi://investment-analysis/research-tasks' }] });
  });

  test('rejects an invalid DCF spread without hiding the error', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    extension((tool) => tools.set(tool.name, tool));
    await expect(tools.get('dcf_model')!.execute('dcf-invalid', { current_fcf: 100, growth_rate: 0.08, discount_rate: 0.03, terminal_growth_rate: 0.03, projection_years: 5, shares_outstanding: 10 }, new AbortController().signal)).rejects.toThrow('discount_rate');
    await expect(tools.get('ddm_model')!.execute('ddm-invalid', { symbol: '600519.SH', current_dividend: 2, growth_rate: 0.05, required_return: 0.03, terminal_growth_rate: 0.03, projection_years: 5 }, new AbortController().signal)).rejects.toThrow('required_return');
  });
});
