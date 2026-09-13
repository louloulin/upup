import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

interface PiFinanceToolHost {
  getToolDefinitions(): readonly unknown[];
}

function getPiFinanceToolHost(): PiFinanceToolHost | undefined {
  return (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: PiFinanceToolHost }).__upupPiFinanceToolHost;
}

type FinanceFreshness = 'realtime' | 'delayed' | 'historical' | 'cached' | 'offline';

interface FinanceEvidence {
  id: string;
  source: string;
  retrievedAt: string;
  asOf?: string;
  query: string;
  freshness: FinanceFreshness;
  warnings: readonly string[];
  auditId: string;
}

interface FinanceResult<T> {
  value: T;
  evidence: readonly FinanceEvidence[];
  warnings: readonly string[];
  auditId: string;
}

function createEvidence(params: Omit<FinanceEvidence, 'warnings'> & { warnings?: readonly string[] }): FinanceEvidence {
  return { ...params, warnings: params.warnings ?? [] };
}

function createFinanceResult<T>(value: T, evidence: readonly FinanceEvidence[], auditId: string): FinanceResult<T> {
  return { value, evidence, warnings: evidence.flatMap((item) => item.warnings), auditId };
}

const symbolParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or security identifier' }),
});
const queryParameters = Type.Object({
  query: Type.String({ minLength: 1, description: 'Research query' }),
});
const dateParameters = Type.Object({
  date: Type.String({ minLength: 10, maxLength: 10, description: 'ISO calendar date' }),
});

function evidenceResult<T>(toolCallId: string, query: string, source: string, value: T, asOf = '2026-09-12') {
  const evidence = createEvidence({
    id: `pi-finance-${source}-${query.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
    source: `upup-fixture://pi-finance-sdk/${source}`,
    retrievedAt: '2026-09-13T00:00:00.000Z',
    asOf,
    query,
    freshness: 'historical',
    auditId: toolCallId,
  });
  return createFinanceResult(value, [evidence], toolCallId);
}

function resultText(value: unknown): string {
  return JSON.stringify(value);
}

export default function financeEvidenceExtension(pi: ExtensionAPI): void {
  const host = getPiFinanceToolHost();
  for (const definition of host?.getToolDefinitions() ?? []) {
    pi.registerTool(definition as never);
  }

  pi.on('session_before_compact', async (event) => {
    const summary = [
      'UpUp financial session compaction summary:',
      'Preserve ticker, market, currency, as-of date, assumptions, risks, evidence IDs, and unfinished workflow phases.',
      `Compaction reason: ${event.reason}.`,
      event.customInstructions ? `User instructions: ${event.customInstructions}` : '',
    ].filter(Boolean).join('\n');
    return {
      compaction: {
        summary,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
        details: { domain: 'finance', schema: 1 },
      },
    };
  });

  pi.registerTool({
    name: 'finance_evidence_quote',
    label: 'Finance evidence quote',
    description: 'Return a deterministic quote with auditable financial evidence metadata.',
    parameters: symbolParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) {
        return { content: [{ type: 'text', text: 'Quote request aborted' }], isError: true };
      }
      const result = evidenceResult(toolCallId, params.symbol, 'quote', { symbol: params.symbol, close: 100, currency: 'CNY' });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_fundamentals',
    label: 'Finance evidence fundamentals',
    description: 'Return deterministic fundamental metrics with auditable evidence metadata.',
    parameters: symbolParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Fundamentals request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.symbol, 'fundamentals', { symbol: params.symbol, revenue: 1000000, pe: 12.5 });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_news',
    label: 'Finance evidence news',
    description: 'Return deterministic research headlines with auditable evidence metadata.',
    parameters: queryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'News request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.query, 'news', { query: params.query, headlines: ['Fixture headline'] });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_search',
    label: 'Finance evidence search',
    description: 'Search deterministic research documents with auditable evidence metadata.',
    parameters: queryParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Search request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.query, 'search', { query: params.query, sources: ['upup-fixture://research/1'] });
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });

  pi.registerTool({
    name: 'finance_evidence_trading_day',
    label: 'Finance evidence trading day',
    description: 'Check a deterministic exchange calendar date with auditable evidence metadata.',
    parameters: dateParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Trading day request aborted' }], isError: true };
      const result = evidenceResult(toolCallId, params.date, 'trading-day', { date: params.date, isTradingDay: true }, params.date);
      return { content: [{ type: 'text', text: resultText(result) }], details: result };
    },
  });
}
