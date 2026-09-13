import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { calculateDcf, calculateTechnicalSignal, type DcfInput } from '../src/index.js';

const dcfParameters = Type.Object({
  currentFcf: Type.Number({ exclusiveMinimum: 0, description: 'Current free cash flow' }),
  growthRate: Type.Number({ description: 'Annual growth rate as a decimal' }),
  discountRate: Type.Number({ description: 'Discount rate as a decimal' }),
  terminalGrowthRate: Type.Number({ description: 'Terminal growth rate as a decimal' }),
  projectionYears: Type.Integer({ minimum: 1, maximum: 20 }),
  sharesOutstanding: Type.Number({ exclusiveMinimum: 0 }),
});
const technicalParameters = Type.Object({
  bars: Type.Array(Type.Object({ date: Type.String(), close: Type.Number() }), { minItems: 3, maxItems: 200 }),
});

export default function investmentAnalysisExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'investment_dcf',
    label: 'Investment DCF',
    description: 'Calculate a deterministic DCF valuation and expose assumptions for review.',
    parameters: dcfParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'DCF request aborted' }], isError: true };
      const result = calculateDcf(params as DcfInput);
      const evidence = { id: `investment-analysis:${toolCallId}:dcf`, source: 'upup-fixture://investment-analysis/dcf', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: '2026-09-13', query: 'investment_dcf', dataFreshness: 'historical', auditId: toolCallId } as const;
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, assumptions: result.assumptions, auditId: toolCallId } };
    },
  });
  pi.registerTool({
    name: 'investment_technical_signal',
    label: 'Investment technical signal',
    description: 'Classify a deterministic moving-average trend from historical bars.',
    parameters: technicalParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'Technical signal request aborted' }], isError: true };
      const result = calculateTechnicalSignal(params.bars);
      const evidence = { id: `investment-analysis:${toolCallId}:technical`, source: 'upup-fixture://investment-analysis/technical', retrievedAt: '2026-09-13T00:00:00.000Z', asOf: params.bars.at(-1)?.date ?? 'unknown', query: 'investment_technical_signal', dataFreshness: 'historical', auditId: toolCallId } as const;
      return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { evidence: [evidence], dataFreshness: evidence.dataFreshness, auditId: toolCallId } };
    },
  });
}
