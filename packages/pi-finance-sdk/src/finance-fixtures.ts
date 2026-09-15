import { createHash } from 'node:crypto';
import { Type, type Static } from 'typebox';
import type {
  FinancialToolDetails,
  UpUpToolContract,
  UpUpToolResult,
} from '@upup/pi-runtime';

const symbolParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or security identifier' }),
});
const queryParameters = Type.Object({
  query: Type.String({ minLength: 1, description: 'Research query' }),
});
const dateParameters = Type.Object({
  date: Type.String({ minLength: 10, maxLength: 10, description: 'ISO calendar date' }),
});

type SymbolInput = Static<typeof symbolParameters>;
type QueryInput = Static<typeof queryParameters>;
type DateInput = Static<typeof dateParameters>;

function fixtureResult<T>(input: string, value: T, source: string, asOf = '2026-09-12'): UpUpToolResult<T> {
  const dataHash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const details: FinancialToolDetails = {
    evidence: [{
      id: `fixture-${source}-${input.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
      source: `upup-fixture://${source}`,
      retrievedAt: '2026-09-13T00:00:00.000Z',
      asOf,
      query: input,
      dataHash,
      confidence: 'high',
    }],
    dataFreshness: 'historical',
    warnings: ['Deterministic fixture data; not a live market quote or investment recommendation.'],
    auditId: `fixture-audit-${source}-${input.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
  };
  return { value, text: JSON.stringify(value), details };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Fixture tool execution aborted', 'AbortError');
}

export const FINANCE_FIXTURE_TOOLS: readonly UpUpToolContract[] = [
  {
    name: 'fixture_market_quote',
    label: 'Fixture market quote',
    description: 'Read a deterministic historical market quote fixture for contract tests.',
    category: 'market',
    safetyLevel: 'safe',
    parameters: symbolParameters,
    maxConcurrent: 4,
    hasFinancialImpact: false,
    async execute(input: SymbolInput, context): Promise<UpUpToolResult<Readonly<Record<string, string | number>>>> {
      throwIfAborted(context.signal);
      context.onUpdate?.({ text: `Loading quote for ${input.symbol}`, progress: 0.5 });
      return fixtureResult(input.symbol, { symbol: input.symbol, close: 100, currency: 'CNY' }, 'market-quote');
    },
  },
  {
    name: 'fixture_fundamentals',
    label: 'Fixture fundamentals',
    description: 'Read deterministic historical fundamental metrics for contract tests.',
    category: 'finance',
    safetyLevel: 'safe',
    parameters: symbolParameters,
    maxConcurrent: 4,
    hasFinancialImpact: false,
    async execute(input: SymbolInput, context): Promise<UpUpToolResult<Readonly<Record<string, string | number>>>> {
      throwIfAborted(context.signal);
      return fixtureResult(input.symbol, { symbol: input.symbol, revenue: 1000000, pe: 12.5 }, 'fundamentals');
    },
  },
  {
    name: 'fixture_news',
    label: 'Fixture news',
    description: 'Read deterministic historical news evidence for contract tests.',
    category: 'research',
    safetyLevel: 'safe',
    parameters: queryParameters,
    maxConcurrent: 4,
    hasFinancialImpact: false,
    async execute(input: QueryInput, context): Promise<UpUpToolResult<Readonly<Record<string, string | readonly string[]>>>> {
      throwIfAborted(context.signal);
      return fixtureResult(input.query, { query: input.query, headlines: ['Fixture headline'] }, 'news');
    },
  },
  {
    name: 'fixture_search',
    label: 'Fixture search',
    description: 'Search deterministic historical research documents for contract tests.',
    category: 'research',
    safetyLevel: 'warning',
    parameters: queryParameters,
    maxConcurrent: 2,
    hasFinancialImpact: false,
    async execute(input: QueryInput, context): Promise<UpUpToolResult<Readonly<Record<string, string | readonly string[]>>>> {
      throwIfAborted(context.signal);
      return fixtureResult(input.query, { query: input.query, sources: ['fixture://research/1'] }, 'search');
    },
  },
  {
    name: 'fixture_trading_day',
    label: 'Fixture trading day',
    description: 'Check a deterministic historical exchange calendar fixture.',
    category: 'market',
    safetyLevel: 'safe',
    parameters: dateParameters,
    maxConcurrent: 8,
    hasFinancialImpact: false,
    async execute(input: DateInput, context): Promise<UpUpToolResult<Readonly<Record<string, string | boolean>>>> {
      throwIfAborted(context.signal);
      return fixtureResult(input.date, { date: input.date, isTradingDay: true }, 'trading-day', input.date);
    },
  },
];
