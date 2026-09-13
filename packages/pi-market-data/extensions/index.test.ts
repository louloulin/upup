import { describe, expect, test } from 'bun:test';
import marketDataExtension from './index.js';

describe('Pi market-data extension', () => {
  test('registers native auditable market tools', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    expect([...tools.keys()]).toEqual(['market_data_quote', 'market_data_history', 'market_trading_day']);
    const result = await tools.get('market_data_quote')!.execute('quote-1', { symbol: '600519.SH', market: 'cn' }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ symbol: '600519.SH', market: 'cn', currency: 'CNY' });
    expect(result.details).toMatchObject({ auditId: 'quote-1', dataFreshness: 'historical', evidence: [{ source: 'upup-fixture://market-data/quote', asOf: '2026-09-12' }] });
  });

  test('honors abort signals before doing work', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    marketDataExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    const controller = new AbortController();
    controller.abort();
    const result = await tools.get('market_data_history')!.execute('history-1', { symbol: 'AAPL', startDate: '2026-09-01', limit: 3 }, controller.signal);
    expect(result.isError).toBe(true);
  });
});
