import { describe, expect, test } from 'bun:test';
import financeEvidenceExtension from './index';
import {
  PI_FINANCE_HOST_CAPABILITIES,
  PI_FINANCE_HOST_CONTRACT,
  PI_FINANCE_PACKAGE_NAME,
  PI_FINANCE_PACKAGE_VERSION,
} from './host-contract';
import { PI_FINANCE_COMMANDS } from './commands';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { publishPiCapabilityHosts } from '@upup/pi-capability-registry';

function eventBus() { return createEventBus(); }
function publishHost(events: ReturnType<typeof createEventBus>, host: Record<string, unknown>) {
  return publishPiCapabilityHosts(events, String(host.sessionId), new Map([[String(host.packageName), host as never]]));
}

describe('Pi finance SDK extension', () => {
  test('registers Pi-native investment commands that route through @upup/pi-investment-workflow', async () => {
    const commands = new Map<string, { handler: (args: string) => Promise<void> }>();
    const messages: string[] = [];
    const entries: Array<{ type: string; data: unknown }> = [];
    const events = eventBus();
    financeEvidenceExtension({
      events,
      on: () => undefined,
      registerTool: () => undefined,
      registerCommand: (name, options) => commands.set(name, options),
      sendUserMessage: (content) => { messages.push(typeof content === 'string' ? content : ''); },
      appendEntry: (type, data) => { entries.push({ type, data }); },
    } as never);

    // The extension registers the whole investment command family from the
    // single-source catalog: canonical names plus their legacy aliases (Pi has
    // no alias field, so each alias is registered as its own command).
    const registered = [...commands.keys()];
    for (const name of PI_FINANCE_COMMANDS) expect(registered).toContain(name);
    for (const alias of ['inv', 'doss', 'strat', 'risk', 'review', 'pr', 'mb', 'brief', 'ep', 'earnings', 'wl', 'watchlist', 'scr']) {
      expect(registered).toContain(alias);
    }
    await commands.get('risk-dashboard')?.handler('600519.SH');
    // The new handler calls `runInvestmentCommand('risk-dashboard', '600519.SH')`
    // which throws (no real workflow execution in the unit test). The catch path
    // surfaces a fail-closed message and records `upup_finance_command_result`
    // with `ok: false`.
    // The new handler writes schema:2 audit entries (was schema:1 for the LLM nudge).
    expect(entries.some(e => e.type === 'upup_finance_command' && (e.data as { schema?: number }).schema === 2 && (e.data as { command?: string }).command === 'risk-dashboard')).toBe(true);
    // It also writes an `upup_finance_command_result` entry marking ok (true on
    // success, false on workflow throw) — either way, both old and new behaviour
    // record a result audit; the schema is 2 in the new wiring.
    const resultEntries = entries.filter(e => e.type === 'upup_finance_command_result');
    expect(resultEntries.length).toBe(1);
    expect((resultEntries[0]?.data as { schema?: number }).schema).toBe(2);
    // The success path renders the workflow output through `pi.sendUserMessage`.
    // If the workflow threw, the fail-closed message starts with "/risk-dashboard failed".
    expect(messages.length).toBeGreaterThan(0);
  });

  test('does not emit LLM prompt-nudge for investment commands', async () => {
    const commands = new Map<string, { handler: (args: string) => Promise<void> }>();
    const messages: string[] = [];
    const events = eventBus();
    financeEvidenceExtension({
      events,
      on: () => undefined,
      registerTool: () => undefined,
      registerCommand: (name, options) => commands.set(name, options),
      sendUserMessage: (content) => { messages.push(typeof content === 'string' ? content : ''); },
      appendEntry: () => undefined,
    } as never);

    await commands.get('dossier')?.handler('AAPL');
    // The OLD prompt-nudge started with the intent verb ("Build or review...").
    // The NEW handler either runs the real workflow or surfaces a fail-closed
    // error — it must NOT push the "Use the Pi finance tools..." template.
    const hasNudge = messages.some(m => m.includes('Use the Pi finance tools'));
    expect(hasNudge).toBe(false);
  });

  test('registers the native read_filings tool with a bounded API contract', () => {
    const tools = new Map<string, { name: string }>();
    const events = eventBus();
    financeEvidenceExtension({ events, on: () => undefined, registerTool: (tool: { name: string }) => tools.set(tool.name, tool), registerCommand: () => undefined, sendUserMessage: () => undefined, appendEntry: () => undefined } as never);
    expect(tools.has('read_filings')).toBe(true);
  });

  test('declares market-aware schemas for live research tools', () => {
    const tools = new Map<string, { name: string; parameters: { properties?: Record<string, unknown> } }>();
    const events = eventBus();
    financeEvidenceExtension({ events, on: () => undefined, registerTool: (tool: { name: string; parameters: { properties?: Record<string, unknown> } }) => tools.set(tool.name, tool), registerCommand: () => undefined, sendUserMessage: () => undefined, appendEntry: () => undefined } as never);
    for (const name of ['get_stock_price', 'get_key_ratios', 'get_analyst_estimates', 'get_earnings', 'get_filings']) {
      expect(tools.get(name)?.parameters.properties).toHaveProperty('market');
    }
  });

  test('accepts only the versioned host contract and requests declared capabilities', async () => {
    const requests: unknown[] = [];
    const events = eventBus();
    const releaseHost = publishHost(events, {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'contract-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      providers: { tools: { getToolDefinitions(request: unknown) {
        requests.push(request);
        return [];
      } } },
    });
    try {
      financeEvidenceExtension({ events, on: () => undefined, registerTool: () => undefined, registerCommand: () => undefined, sendUserMessage: () => undefined, appendEntry: () => undefined } as never);
      expect(requests).toEqual([{
        contract: PI_FINANCE_HOST_CONTRACT,
        packageName: PI_FINANCE_PACKAGE_NAME,
        packageVersion: PI_FINANCE_PACKAGE_VERSION,
        sessionId: 'contract-session',
        capability: 'tool-definitions',
      }]);
    } finally {
      releaseHost?.();
    }
  });

  test('does not request host tools when the package identity is not exact', () => {
    const requests: unknown[] = [];
    const events = eventBus();
    const releaseHost = publishHost(events, { packageName: PI_FINANCE_PACKAGE_NAME,
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: '@upup/impersonator',
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'contract-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      providers: { tools: { getToolDefinitions(request: unknown) {
        requests.push(request);
        return [{ name: 'must-not-load' }];
      } } },
    });
    try {
      const tools = new Map<string, unknown>();
      financeEvidenceExtension({
        events,
        on: () => undefined,
        registerTool: (tool: { name: string }) => tools.set(tool.name, tool),
        registerCommand: () => undefined,
        sendUserMessage: () => undefined,
        appendEntry: () => undefined,
      } as never);
      expect(requests).toEqual([]);
      expect(tools.has('must-not-load')).toBe(false);
    } finally {
      releaseHost?.();
    }
  });

  test('registers the complete deterministic finance tool set', async () => {
    const events = eventBus();
    const releaseHost = publishHost(events, {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'finance-test-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      providers: { tools: { getToolDefinitions: () => [] }, marketData: { getMarketQuoteFetcher: () => async () => new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000 } }] } }), { status: 200 }) } },
    });
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    try {
      financeEvidenceExtension({
        events,
        on: () => undefined,
        registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
        registerCommand: () => undefined,
        sendUserMessage: () => undefined,
        appendEntry: () => undefined,
      } as never);

    expect([...tools.keys()]).toEqual([
      'alt_data_fetch',
      'alt_data_search',
      'get_investment_strategies',
      'track_company',
      'track_sector',
      'get_knowledge_summary',
      'finance_evidence_quote',
      'get_trade_quote',
      'get_trading_positions',
      'get_trading_balance',
      'place_trade_order',
      'cancel_trade_order',
      'strategy_run_paper',
      'strategy_list',
      'strategy_backtest',
      'fund_search',
      'fund_screen',
      'fund_top',
      'fund_compare',
      'fund_list',
      'fund_follow',
      'fund_unfollow',
      'fund_alert_create',
      'fund_alert_list',
      'fund_alert_delete',
      'fund_detail',
      'fund_performance',
      'fund_holdings',
      'fund_manager',
      'get_astock_financials',
      'get_financials',
      'read_filings',
      'get_stock_price',
      'get_key_ratios',
      'get_analyst_estimates',
      'get_earnings',
      'get_filings',
      'get_astock_news',
      'get_company_profile',
      'get_risks',
      'get_sectors',
      'calculate_capital_gains_tax',
      'calculate_trades_tax',
      'calculate_pnl',
      'finance_evidence_fundamentals',
      'finance_evidence_news',
      'finance_evidence_search',
      'finance_evidence_trading_day',
    ]);
    const result = await tools.get('finance_evidence_quote')!.execute('quote-1', { symbol: '600519.SH' }, new AbortController().signal);
    expect(result.details).toMatchObject({
      auditId: 'quote-1',
      evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart', asOf: '2026-09-13', freshness: 'delayed' }],
    });
    const astockFinancials = await tools.get('get_astock_financials')!.execute('astock-financials-1', { code: '比亚迪' }, new AbortController().signal);
    expect(astockFinancials).toMatchObject({ details: { auditId: 'astock-financials-1', evidence: [{ source: 'upup-pi://finance-sdk/astock-financials', freshness: 'historical', asOf: '2026-09-12' }] } });
    const astockNews = await tools.get('get_astock_news')!.execute('astock-news-1', { code: '比亚迪', limit: 2 }, new AbortController().signal);
    expect(astockNews).toMatchObject({ details: { auditId: 'astock-news-1', evidence: [{ source: 'upup-pi://finance-sdk/astock-news', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(astockNews.content[0].text).value).toMatchObject({ type: 'announcement', tsCode: '002594.SZ', count: 2 });
    const financials = await tools.get('get_financials')!.execute('financials-1', { query: 'Apple revenue and ROE' }, new AbortController().signal);
    expect(financials).toMatchObject({ details: { auditId: 'financials-1', evidence: [{ source: 'upup-pi://finance-sdk/financials', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(financials.content[0].text).value).toMatchObject({ symbol: 'AAPL', metrics: { latestRevenue: 4161.6 } });
    const companyProfile = await tools.get('get_company_profile')!.execute('company-profile-1', { ticker: '贵州茅台' }, new AbortController().signal);
    expect(companyProfile).toMatchObject({ details: { auditId: 'company-profile-1', evidence: [{ source: 'upup-pi://finance-sdk/company-profile', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(companyProfile.content[0].text).value).toMatchObject({ found: true, ticker: '600519.SH', name: '贵州茅台' });
    const risks = await tools.get('get_risks')!.execute('risks-1', { ticker: '002594.SZ', severity: 'high', type: 'sector' }, new AbortController().signal);
    expect(risks).toMatchObject({ details: { auditId: 'risks-1', evidence: [{ source: 'upup-pi://finance-sdk/risks', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(risks.content[0].text).value.risks).toMatchObject([{ id: 'risk-002594-competition' }]);
    const sectors = await tools.get('get_sectors')!.execute('sectors-1', { name: '新能源' }, new AbortController().signal);
    expect(sectors).toMatchObject({ details: { auditId: 'sectors-1', evidence: [{ source: 'upup-pi://finance-sdk/sectors', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(sectors.content[0].text).value).toMatchObject({ found: true, count: 1, sectors: [{ name: '新能源' }] });
    const strategies = await tools.get('get_investment_strategies')!.execute('strategies-1', { risk_tolerance: 'conservative', time_horizon: 'long' }, new AbortController().signal);
    expect(strategies).toMatchObject({ details: { auditId: 'strategies-1', evidence: [{ source: 'upup-pi://finance-sdk/investment-strategies', freshness: 'offline', asOf: '2026-09-12' }] } });
    expect(JSON.parse(strategies.content[0].text).value).toMatchObject({ count: 2, strategies: [{ id: 'value-investing' }, { id: 'index-investing' }] });
    const trackedCompany = await tools.get('track_company')!.execute('track-company-1', { ticker: 'aapl', name: 'Apple', sector: 'Technology', industry: 'Consumer Electronics', summary: 'Session research note.', key_metrics: { pe: 34.2 }, competitive_advantages: ['Ecosystem'], risks: ['Regulation'] }, new AbortController().signal);
    const trackedSector = await tools.get('track_sector')!.execute('track-sector-1', { name: 'Technology', description: 'Session sector note.', trends: ['AI investment'], outlook: 'bullish' }, new AbortController().signal);
    const summary = await tools.get('get_knowledge_summary')!.execute('knowledge-summary-1', {}, new AbortController().signal);
    expect(trackedCompany).toMatchObject({ details: { auditId: 'track-company-1', evidence: [{ source: 'upup-pi://finance-sdk/knowledge-journal/company', freshness: 'cached' }] } });
    expect(trackedSector).toMatchObject({ details: { auditId: 'track-sector-1', evidence: [{ source: 'upup-pi://finance-sdk/knowledge-journal/sector', freshness: 'cached' }] } });
    expect(JSON.parse(summary.content[0].text).value.investmentKnowledge).toMatchObject({ companies: 1, sectors: 1, strategies: 5, risks: 0 });
    const tax = await tools.get('calculate_capital_gains_tax')!.execute('tax-native-1', { symbol: 'AAPL', quantity: 100, purchase_price: 100, current_price: 150, purchase_date: '2024-01-01', as_of: '2026-09-12', jurisdiction: 'us' }, new AbortController().signal);
    expect(tax).toMatchObject({ details: { auditId: 'tax-native-1', evidence: [{ source: 'upup-pi://finance-sdk/capital-gains-tax', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(tax.content[0].text).value).toMatchObject({ gain: 5000, estimatedTax: 1000, isLongTerm: true });
    const tradesTax = await tools.get('calculate_trades_tax')!.execute('trades-tax-native-1', { jurisdiction: 'us', trades: [{ symbol: 'AAPL', quantity: 100, purchase_price: 100, sell_price: 150, purchase_date: '2024-01-01', sell_date: '2026-09-12' }] }, new AbortController().signal);
    expect(tradesTax).toMatchObject({ details: { auditId: 'trades-tax-native-1', evidence: [{ source: 'upup-pi://finance-sdk/trades-tax', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(tradesTax.content[0].text).value.summary).toMatchObject({ totalGain: 5000, totalEstimatedTax: 1000, longTermTrades: 1 });
    const pnl = await tools.get('calculate_pnl')!.execute('pnl-native-1', { currency: 'USD', trades: [{ symbol: 'AAPL', quantity: 2, purchase_price: 100, sell_price: 120 }, { symbol: 'TSLA', quantity: 1, purchase_price: 200, sell_price: 180 }] }, new AbortController().signal);
    expect(pnl).toMatchObject({ details: { auditId: 'pnl-native-1', evidence: [{ source: 'upup-pi://finance-sdk/pnl', freshness: 'historical', asOf: '2026-09-12' }] } });
    expect(JSON.parse(pnl.content[0].text).value).toMatchObject({ totalPnl: 20, winningTrades: 1, losingTrades: 1, winRate: 50 });
    const fundSearch = await tools.get('fund_search')!.execute('fund-search-native-1', { keyword: '易方达' }, new AbortController().signal);
    const fundPayload = JSON.parse(fundSearch.content[0].text);
    expect(fundPayload.value.matches.find((fund: { code: string }) => fund.code === '005827')).toMatchObject({ code: '005827', name: '易方达蓝筹精选混合', type: '混合型', scale: 210, netGrowth12: 13.6 });
    expect(fundSearch.details).toMatchObject({ auditId: 'fund-search-native-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-search', freshness: 'offline' }] });
    const fundScreen = await tools.get('fund_screen')!.execute('fund-screen-native-1', { type: '混合型', min_return: 15, sort_by: 'return', limit: 5 }, new AbortController().signal);
    const screenPayload = JSON.parse(fundScreen.content[0].text);
    expect(screenPayload.value.results.length).toBeGreaterThan(0);
    expect(screenPayload.value.results.every((fund: { type: string; netGrowth12?: number }) => fund.type === '混合型' && (fund.netGrowth12 ?? 0) >= 15)).toBe(true);
    expect(fundScreen.details).toMatchObject({ auditId: 'fund-screen-native-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-screen', freshness: 'offline' }] });
    const fundTop = await tools.get('fund_top')!.execute('fund-top-native-1', { limit: 3 }, new AbortController().signal);
    const topPayload = JSON.parse(fundTop.content[0].text);
    expect(topPayload.value.results).toHaveLength(3);
    expect(fundTop.details).toMatchObject({ auditId: 'fund-top-native-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-top', freshness: 'offline' }] });
    for (const [toolName, source] of [
      ['fund_detail', 'fund-detail'],
      ['fund_performance', 'fund-performance'],
      ['fund_holdings', 'fund-holdings'],
      ['fund_manager', 'fund-manager'],
    ] as const) {
      const result = await tools.get(toolName)!.execute(`${toolName}-native-1`, { fund_code: '110022' }, new AbortController().signal);
      expect(result.isError).not.toBe(true);
      expect(result.details).toMatchObject({ auditId: `${toolName}-native-1`, evidence: [{ source: `upup-pi://finance-sdk/${source}`, freshness: 'historical', asOf: '2026-09-12' }] });
    }
    const comparison = await tools.get('fund_compare')!.execute('fund-compare-native-1', { fund_codes: ['110022', '161725', '005827'], period: '1Y' }, new AbortController().signal);
    expect(comparison.isError).not.toBe(true);
    expect(JSON.parse(comparison.content[0].text).value.funds.map((fund: { code: string }) => fund.code)).toEqual(['110022', '005827', '161725']);
    expect(comparison.details).toMatchObject({ auditId: 'fund-compare-native-1', evidence: [{ source: 'upup-pi://finance-sdk/fund-compare', freshness: 'historical', asOf: '2026-09-12' }] });
    const followed = await tools.get('fund_follow')!.execute('fund-follow-native-1', { fund_code: '110022', note: '消费观察' }, new AbortController().signal);
    expect(followed.isError).not.toBe(true);
    expect(JSON.parse(followed.content[0].text).value).toMatchObject({ added: true, funds: [{ code: '110022', note: '消费观察' }] });
    const listed = await tools.get('fund_list')!.execute('fund-list-native-1', { limit: 10 }, new AbortController().signal);
    expect(JSON.parse(listed.content[0].text).value.funds).toHaveLength(1);
    const unfollowed = await tools.get('fund_unfollow')!.execute('fund-unfollow-native-1', { fund_code: '110022' }, new AbortController().signal);
    expect(JSON.parse(unfollowed.content[0].text).value.removed).toBe(true);
    const alert = await tools.get('fund_alert_create')!.execute('alert-native-1', { fund_code: '110022', alert_type: 'change_down', value: 5 }, new AbortController().signal);
    expect(alert.isError).not.toBe(true);
    expect(JSON.parse(alert.content[0].text).value).toMatchObject({ id: 'alert-alert-native-1', enabled: true, triggerCount: 0 });
    const alerts = await tools.get('fund_alert_list')!.execute('alert-list-native-1', {}, new AbortController().signal);
    expect(JSON.parse(alerts.content[0].text).value.alerts).toHaveLength(1);
    const deletedAlert = await tools.get('fund_alert_delete')!.execute('alert-delete-native-1', { alert_id: 'alert-alert-native-1' }, new AbortController().signal);
    expect(JSON.parse(deletedAlert.content[0].text).value.deleted).toBe(true);
    } finally {
      releaseHost?.();
    }
  });

  test('reads sandbox trading state natively with auditable evidence', async () => {
    const events = eventBus();
    const releaseHost = publishHost(events, {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'finance-test-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      providers: { tools: { getToolDefinitions: () => [] }, marketData: { getMarketQuoteFetcher: () => async () => new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000 } }] } }), { status: 200 }) } },
    });
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    try {
      financeEvidenceExtension({
        events,
        on: () => undefined,
        registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
        registerCommand: () => undefined,
        sendUserMessage: () => undefined,
        appendEntry: () => undefined,
      } as never);
      const result = await tools.get('get_trade_quote')!.execute('quote-native-1', { symbol: '600519.SH' }, new AbortController().signal);
      const payload = JSON.parse(result.content[0].text);
      expect(payload.value).toMatchObject({ symbol: '600519.SH', last: 1600 });
      expect(result.details).toMatchObject({ auditId: 'quote-native-1', evidence: [{ source: 'https://query1.finance.yahoo.com/v8/finance/chart', freshness: 'delayed' }] });
      expect(tools.has('get_trading_positions')).toBe(true);
      expect(tools.has('get_trading_balance')).toBe(true);
    } finally {
      releaseHost?.();
    }
  });

  test('uses the structured market quote Host service when available', async () => {
    let rawFetchCalled = false;
    const events = eventBus();
    const releaseHost = publishHost(events, {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'structured-quote-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      providers: { tools: { getToolDefinitions: () => [] }, marketData: { getMarketQuoteFetcher: () => async () => { rawFetchCalled = true; return new Response('{}', { status: 500 }); },
      getMarketQuote: async (symbol: string, _market: string | undefined, _signal: AbortSignal | undefined, auditId: string) => ({
        value: { symbol, market: 'cn' as const, price: 1601, bid: 1600.5, ask: 1601.5, last: 1601, currency: 'CNY' as const, asOf: '2026-09-13', source: 'https://api.tushare.pro', freshness: 'delayed' as const, indicative: true },
        evidence: { id: `market-data:${auditId}:quote`, source: 'https://api.tushare.pro', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-13', query: symbol, dataFreshness: 'delayed' as const, auditId },
      }) } },
    });
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    try {
      financeEvidenceExtension({ events, on: () => undefined, registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool), registerCommand: () => undefined, sendUserMessage: () => undefined, appendEntry: () => undefined } as never);
      const result = await tools.get('finance_evidence_quote')!.execute('structured-quote-1', { symbol: '600519.SH' }, new AbortController().signal);
      expect(rawFetchCalled).toBe(false);
      expect(result).toMatchObject({ details: { value: { symbol: '600519.SH', last: 1601 }, evidence: [{ source: 'https://api.tushare.pro', freshness: 'delayed', auditId: 'structured-quote-1' }] } });
    } finally {
      releaseHost?.();
    }
  });

  test('denies native trading writes without interactive approval', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    const events = eventBus();
    financeEvidenceExtension({
      events,
      on: () => undefined,
      registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
      registerCommand: () => undefined,
      sendUserMessage: () => undefined,
      appendEntry: () => undefined,
    } as never);
    const result = await tools.get('place_trade_order')!.execute('trade-denied-1', { symbol: '600519.SH', side: 'buy', quantity: 100 }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.details.policyAudit).toMatchObject({ safetyLevel: 'dangerous', decision: 'approval_denied' });
    expect(JSON.parse(result.content[0].text).value.status).toBe('rejected');
  });

  test('executes native sandbox writes only after interactive approval', async () => {
    const events = eventBus();
    const releaseHost = publishHost(events, {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'finance-trade-test-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      providers: { tools: { getToolDefinitions: () => [] }, marketData: { getMarketQuoteFetcher: () => async () => new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 1600, regularMarketTime: Date.parse('2026-09-13T00:00:00Z') / 1000 } }] } }), { status: 200 }) } },
    });
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    try {
      financeEvidenceExtension({
        events,
        on: () => undefined,
        registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
        registerCommand: () => undefined,
        sendUserMessage: () => undefined,
        appendEntry: () => undefined,
      } as never);
      const stateFile = `/tmp/upup-pi-finance-trade-${Date.now()}.json`;
      const previous = process.env.UPUP_SANDBOX_STATE_FILE;
      process.env.UPUP_SANDBOX_STATE_FILE = stateFile;
      const context = { hasUI: true, ui: { confirm: async () => true } };
      const result = await tools.get('place_trade_order')!.execute('trade-approved-1', { symbol: '600519.SH', side: 'buy', quantity: 100 }, new AbortController().signal, undefined, context);
      expect(result.isError).not.toBe(true);
      expect(result.details.policyAudit).toMatchObject({ safetyLevel: 'dangerous', decision: 'approval_granted' });
      expect(JSON.parse(result.content[0].text).value.order).toMatchObject({ status: 'filled', symbol: '600519.SH', filledQuantity: 100 });
      if (previous === undefined) delete process.env.UPUP_SANDBOX_STATE_FILE;
      else process.env.UPUP_SANDBOX_STATE_FILE = previous;
      await Bun.file(stateFile).delete().catch(() => undefined);
    } finally {
      releaseHost?.();
    }
  });
});
