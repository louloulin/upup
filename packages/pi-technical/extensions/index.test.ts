import { describe, expect, test } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import technicalExtension from './index';

const fixtureBars = [
  { date: '2026-09-01', open: 100, high: 105, low: 99, close: 104, volume: 1000 },
  { date: '2026-09-02', open: 104, high: 108, low: 103, close: 107, volume: 1200 },
  { date: '2026-09-03', open: 107, high: 110, low: 106, close: 109, volume: 1100 },
  { date: '2026-09-04', open: 109, high: 112, low: 108, close: 111, volume: 1300 },
  { date: '2026-09-05', open: 111, high: 115, low: 110, close: 114, volume: 1500 },
  { date: '2026-09-06', open: 114, high: 116, low: 112, close: 113, volume: 1400 },
  { date: '2026-09-07', open: 113, high: 115, low: 111, close: 112, volume: 1200 },
  { date: '2026-09-08', open: 112, high: 114, low: 110, close: 111, volume: 1100 },
  { date: '2026-09-09', open: 111, high: 113, low: 109, close: 110, volume: 1000 },
  { date: '2026-09-10', open: 110, high: 112, low: 108, close: 109, volume: 950 },
];

function makeHost(): { host: { events: ReturnType<typeof createEventBus>; registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => void }; tools: Map<string, { name: string; execute: (...args: unknown[]) => Promise<unknown> }> } {
  const tools = new Map<string, { name: string; execute: (...args: unknown[]) => Promise<unknown> }>();
  return { host: { events: createEventBus(), registerTool: (tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => tools.set(tool.name, tool) } as never, tools };
}

describe('Pi technical extension', () => {
  test('registers all native tools', () => {
    const { host, tools } = makeHost();
    technicalExtension(host as never);
    expect([...tools.keys()].sort()).toEqual(['compute_atr', 'compute_boll', 'compute_cci', 'compute_indicators', 'compute_kdj', 'compute_macd', 'compute_obv', 'compute_rsi']);
  });

  test('compute_indicators returns requested indicator suite', async () => {
    const { host, tools } = makeHost();
    technicalExtension(host as never);
    const tool = tools.get('compute_indicators')!;
    const result = (await tool.execute('a-1', { symbol: '600519.SH', bars: fixtureBars, indicators: ['macd', 'rsi'] }, new AbortController().signal)) as { content: Array<{ text: string }>; details: Record<string, unknown> };
    const value = JSON.parse(result.content[0]!.text);
    expect(value.symbol).toBe('600519.SH');
    expect(value.count).toBe(10);
    expect(value.indicators.macd).toBeDefined();
    expect(value.indicators.rsi).toBeDefined();
    expect(value.indicators.kdj).toBeUndefined();
    expect(result.details.auditId).toBe('a-1');
  });

  test('compute_macd accepts custom periods', async () => {
    const { host, tools } = makeHost();
    technicalExtension(host as never);
    const closes = fixtureBars.map((bar) => bar.close);
    const tool = tools.get('compute_macd')!;
    const result = (await tool.execute('a-2', { symbol: 'X', closes, fastPeriod: 5, slowPeriod: 10, signalPeriod: 5 }, new AbortController().signal)) as { content: Array<{ text: string }> };
    const value = JSON.parse(result.content[0]!.text);
    expect(value.dif.length).toBe(closes.length);
    expect(value.dea.length).toBe(closes.length);
    expect(value.histogram.length).toBe(closes.length);
  });

  test('honors abort signal', async () => {
    const { host, tools } = makeHost();
    technicalExtension(host as never);
    const tool = tools.get('compute_indicators')!;
    const controller = new AbortController();
    controller.abort();
    const result = (await tool.execute('a-3', { symbol: 'X', bars: fixtureBars }, controller.signal)) as { isError: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/aborted/);
  });
});
