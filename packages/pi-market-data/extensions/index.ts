import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { isTradingDay, makeFixtureBars, makeFixtureQuote, normalizeMarket, type Market } from '../src/index.js';

const quoteParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or fund identifier' }),
  market: Type.Optional(Type.String({ description: 'cn, hk, us, fund, or crypto' })),
});
const historyParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or fund identifier' }),
  startDate: Type.String({ minLength: 10, maxLength: 10, description: 'ISO start date' }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 30, description: 'Number of daily bars' })),
});
const tradingDayParameters = Type.Object({
  date: Type.String({ minLength: 10, maxLength: 10, description: 'ISO calendar date' }),
  market: Type.Optional(Type.String({ description: 'cn, hk, us, fund, or crypto' })),
});

function text(value: unknown): string { return JSON.stringify(value); }

export default function marketDataExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'market_data_quote',
    label: 'Market data quote',
    description: 'Read a market quote with an auditable as-of date and data source.',
    parameters: quoteParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Market quote request aborted' }], isError: true };
      const result = makeFixtureQuote(params.symbol, params.market, toolCallId);
      return { content: [{ type: 'text', text: text(result.value) }], details: { evidence: [result.evidence], dataFreshness: result.evidence.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'market_data_history',
    label: 'Market data history',
    description: 'Read deterministic historical daily bars with an evidence record.',
    parameters: historyParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Historical data request aborted' }], isError: true };
      const result = makeFixtureBars(params.symbol, params.startDate, params.limit ?? 10, toolCallId);
      return { content: [{ type: 'text', text: text(result.value) }], details: { evidence: [result.evidence], dataFreshness: result.evidence.dataFreshness, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'market_trading_day',
    label: 'Market trading day',
    description: 'Check whether a date is a trading day for a selected market.',
    parameters: tradingDayParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Trading day request aborted' }], isError: true };
      const market = normalizeMarket(params.market) as Market;
      const value = { date: params.date, market, isTradingDay: isTradingDay(params.date, market) };
      const evidence = { id: `market-data:${toolCallId}:calendar`, source: 'upup-fixture://market-data/calendar', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: params.date, query: `${market}:${params.date}`, dataFreshness: 'historical', auditId: toolCallId } as const;
      return { content: [{ type: 'text', text: text(value) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
    },
  });
}
