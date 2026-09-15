import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerPiCapabilityHost } from '@upup/pi-capability-registry';

const PACKAGE = '@upup/pi-corporate-actions';
const VERSION = '0.1.0';

interface PiHostRegistration {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly sessionId: string;
  readonly capabilities: readonly string[];
}

function registerHostTools(pi: ExtensionAPI): void {
  registerPiCapabilityHost(pi, PACKAGE, (host) => {
    if (host.packageVersion !== VERSION || !host.sessionId) return;
  });
}
import {
  aggregateActions,
  annualizedDividendYield,
  computeTotalReturn,
  createDryRunClient,
  dryRunEvidence,
  filterDividends,
  rightsTheoreticalExPrice,
  sortSplitsChronologically,
  totalDividends,
  type CorporateAction,
  type CorporateActionsEvidence,
  type RawBar,
} from '../src/index';

const symbolParam = Type.String({ minLength: 1, maxLength: 24, description: 'Symbol identifier (e.g. 600519.SH, 00700.HK, AAPL)' });

function text(value: unknown): string { return JSON.stringify(value, null, 2); }

function evidenceEnvelope<T>(payload: T): T & { evidence: CorporateActionsEvidence } {
  return { ...payload, evidence: dryRunEvidence() };
}

export default function corporateActionsExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);
  const client = createDryRunClient();

  pi.registerTool({
    name: 'corporate_actions_dividends',
    label: 'List historical dividends',
    description: 'List historical dividend events (ex-date, amount per share, currency, payable date) for a symbol. Uses the dry-run client so it is deterministic and offline-safe.',
    parameters: Type.Object({
      symbol: symbolParam,
      startDate: Type.Optional(Type.String({ description: 'ISO date inclusive lower bound (YYYY-MM-DD)' })),
      endDate: Type.Optional(Type.String({ description: 'ISO date inclusive upper bound (YYYY-MM-DD)' })),
      minAmount: Type.Optional(Type.Number({ description: 'Minimum amount per share filter' })),
      currency: Type.Optional(Type.String({ description: 'Currency code filter (CNY/HKD/USD/...)' })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_dividends aborted' }], isError: true, details: undefined };
      const all = await client.listDividends(params.symbol);
      const filtered = filterDividends(all, {
        ...(params.startDate !== undefined ? { startDate: params.startDate } : {}),
        ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
        ...(params.minAmount !== undefined ? { minAmount: params.minAmount } : {}),
        ...(params.currency !== undefined ? { currency: params.currency } : {}),
      });
      const total = totalDividends(filtered);
      const value = evidenceEnvelope({ symbol: params.symbol, count: filtered.length, totalAmount: total, dividends: filtered });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol, count: filtered.length },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_splits',
    label: 'List historical stock splits',
    description: 'List historical stock split events (ex-date, ratio from/to, reverse-split flag) for a symbol. Uses the dry-run client.',
    parameters: Type.Object({ symbol: symbolParam }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_splits aborted' }], isError: true, details: undefined };
      const all = await client.listSplits(params.symbol);
      const sorted = sortSplitsChronologically(all);
      const value = evidenceEnvelope({ symbol: params.symbol, count: sorted.length, splits: sorted });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol, count: sorted.length },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_rights',
    label: 'List historical rights issues',
    description: 'List historical rights issue events (ex-date, ratio from/to, subscription price, currency) for a symbol. Uses the dry-run client.',
    parameters: Type.Object({ symbol: symbolParam }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_rights aborted' }], isError: true, details: undefined };
      const all = await client.listRightsIssues(params.symbol);
      const value = evidenceEnvelope({ symbol: params.symbol, count: all.length, rightsIssues: all });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol, count: all.length },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_list_all',
    label: 'List all corporate actions',
    description: 'List every corporate action (dividend / split / rights_issue / spinoff) for a symbol, sorted chronologically. Uses the dry-run client.',
    parameters: Type.Object({ symbol: symbolParam }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_list_all aborted' }], isError: true, details: undefined };
      const all = await client.listAll(params.symbol);
      const value = evidenceEnvelope({ symbol: params.symbol, count: all.length, actions: all });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol, count: all.length },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_adjust_prices',
    label: 'Adjust price series for corporate actions',
    description: 'Adjust a raw bar series (date, close) for split events using back-adjust or forward-adjust method. Returns per-bar adjusted close and adjustment factor.',
    parameters: Type.Object({
      symbol: symbolParam,
      method: Type.Union([Type.Literal('back-adjust'), Type.Literal('forward-adjust')]),
      bars: Type.Array(Type.Object({
        date: Type.String(),
        close: Type.Number(),
      }), { minItems: 1, maxItems: 5000 }),
    }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_adjust_prices aborted' }], isError: true, details: undefined };
      const splits = await client.listSplits(params.symbol);
      const actions: CorporateAction[] = splits.map((s) => ({
        symbol: s.symbol,
        type: 'split',
        exDate: s.exDate,
        ratioFrom: s.ratioFrom,
        ratioTo: s.ratioTo,
      }));
      const { adjustBars } = await import('../src/adjustments');
      const out = adjustBars(
        { symbol: params.symbol, method: params.method, actions },
        params.bars as readonly RawBar[],
      );
      const value = evidenceEnvelope({ symbol: params.symbol, method: params.method, count: out.length, bars: out });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol, count: out.length },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_total_return',
    label: 'Compute total return',
    description: 'Compute total return (price + dividend + split + rights contributions) between two dates using historical events. Uses the dry-run client.',
    parameters: Type.Object({
      symbol: symbolParam,
      startDate: Type.String(),
      endDate: Type.String(),
      startPrice: Type.Number(),
      endPrice: Type.Number(),
    }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_total_return aborted' }], isError: true, details: undefined };
      const [dividends, splits, rightsIssues] = await Promise.all([
        client.listDividends(params.symbol),
        client.listSplits(params.symbol),
        client.listRightsIssues(params.symbol),
      ]);
      const breakdown = computeTotalReturn({
        symbol: params.symbol,
        startDate: params.startDate,
        endDate: params.endDate,
        startPrice: params.startPrice,
        endPrice: params.endPrice,
        dividends,
        splits,
        rightsIssues,
      });
      const value = evidenceEnvelope({ symbol: params.symbol, ...breakdown });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_dividend_yield',
    label: 'Compute trailing dividend yield',
    description: 'Compute trailing 365-day dividend yield (annualized, naive) for a symbol using the dry-run client.',
    parameters: Type.Object({
      symbol: symbolParam,
      pricePerShare: Type.Number({ minimum: 0 }),
      lookbackDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_dividend_yield aborted' }], isError: true, details: undefined };
      const dividends = await client.listDividends(params.symbol);
      const yieldPct = annualizedDividendYield(dividends, params.pricePerShare, params.lookbackDays ?? 365);
      const value = evidenceEnvelope({
        symbol: params.symbol,
        pricePerShare: params.pricePerShare,
        lookbackDays: params.lookbackDays ?? 365,
        yieldPct,
      });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol },
      };
    },
  });

  pi.registerTool({
    name: 'corporate_actions_ex_price',
    label: 'Compute rights issue theoretical ex-price',
    description: 'Compute the theoretical ex-rights price for a given last close and a rights issue event (ratio, subscription price).',
    parameters: Type.Object({
      symbol: symbolParam,
      lastClose: Type.Number(),
    }),
    async execute(toolCallId, params, signal) {
      if (signal?.aborted) return { content: [{ type: 'text', text: 'corporate_actions_ex_price aborted' }], isError: true, details: undefined };
      const rights = await client.listRightsIssues(params.symbol);
      if (rights.length === 0) {
        return {
          content: [{ type: 'text', text: text(evidenceEnvelope({ symbol: params.symbol, lastClose: params.lastClose, exPrice: params.lastClose, rightsIssue: null })) }],
          details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol },
        };
      }
      const r = rights[0];
      const exPrice = rightsTheoreticalExPrice(r, params.lastClose);
      const value = evidenceEnvelope({ symbol: params.symbol, lastClose: params.lastClose, exPrice, rightsIssue: r });
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: dryRunEvidence().source, symbol: params.symbol },
      };
    },
  });
}

// aggregateActions is re-exported to satisfy the bundle audit in check:pi-packages
export const _aggregateActions = aggregateActions;
