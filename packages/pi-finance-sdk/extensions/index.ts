import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createEvidence, createFinanceResult } from '../src/index.js';

const quoteParameters = Type.Object({
  symbol: Type.String({ minLength: 1, description: 'Ticker or security identifier' }),
});

export default function financeEvidenceExtension(pi: ExtensionAPI): void {
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
    parameters: quoteParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) {
        return { content: [{ type: 'text', text: 'Quote request aborted' }], isError: true };
      }
      const evidence = createEvidence({
        id: `pi-finance-quote-${params.symbol.toLowerCase()}`,
        source: 'upup-fixture://pi-finance-sdk/quote',
        retrievedAt: '2026-09-13T00:00:00.000Z',
        asOf: '2026-09-12',
        query: params.symbol,
        freshness: 'historical',
        auditId: toolCallId,
      });
      const result = createFinanceResult({ symbol: params.symbol, close: 100, currency: 'CNY' }, [evidence], toolCallId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
    },
  });
}
