import type {
  CorporateAction,
  CorporateActionsClient,
  CorporateActionsEvidence,
  DividendEvent,
  RightsIssueEvent,
  SplitEvent,
} from './types.js';

export interface DryRunFixture {
  readonly dividends: Record<string, readonly DividendEvent[]>;
  readonly splits: Record<string, readonly SplitEvent[]>;
  readonly rightsIssues: Record<string, readonly RightsIssueEvent[]>;
}

const DEFAULT_FIXTURE: DryRunFixture = {
  dividends: {
    '600519.SH': [
      { symbol: '600519.SH', exDate: '2023-06-15', amountPerShare: 30.88, currency: 'CNY', payableDate: '2023-06-20' },
      { symbol: '600519.SH', exDate: '2024-06-15', amountPerShare: 30.88, currency: 'CNY', payableDate: '2024-06-20' },
    ],
    '000858.SZ': [
      { symbol: '000858.SZ', exDate: '2024-05-10', amountPerShare: 2.5, currency: 'CNY' },
    ],
  },
  splits: {
    'AAPL': [
      { symbol: 'AAPL', exDate: '2020-08-31', ratioFrom: 1, ratioTo: 4 },
      { symbol: 'AAPL', exDate: '2014-06-09', ratioFrom: 1, ratioTo: 7 },
    ],
  },
  rightsIssues: {
    '0700.HK': [
      { symbol: '0700.HK', exDate: '2024-05-22', ratioFrom: 1, ratioTo: 0.1, pricePerShare: 320.0, currency: 'HKD' },
    ],
  },
};

export function createDryRunClient(fixture: DryRunFixture = DEFAULT_FIXTURE): CorporateActionsClient {
  return {
    async listDividends(symbol: string): Promise<readonly DividendEvent[]> {
      return fixture.dividends[symbol] ?? [];
    },
    async listSplits(symbol: string): Promise<readonly SplitEvent[]> {
      return fixture.splits[symbol] ?? [];
    },
    async listRightsIssues(symbol: string): Promise<readonly RightsIssueEvent[]> {
      return fixture.rightsIssues[symbol] ?? [];
    },
    async listAll(symbol: string): Promise<readonly CorporateAction[]> {
      const dividends = (fixture.dividends[symbol] ?? []).map((d) => ({
        symbol: d.symbol,
        type: 'dividend' as const,
        exDate: d.exDate,
        amountPerShare: d.amountPerShare,
        currency: d.currency,
        ...(d.payableDate !== undefined ? { payableDate: d.payableDate } : {}),
      }));
      const splits = (fixture.splits[symbol] ?? []).map((s) => ({
        symbol: s.symbol,
        type: 'split' as const,
        exDate: s.exDate,
        ratioFrom: s.ratioFrom,
        ratioTo: s.ratioTo,
      }));
      const rights = (fixture.rightsIssues[symbol] ?? []).map((r) => ({
        symbol: r.symbol,
        type: 'rights_issue' as const,
        exDate: r.exDate,
        ratioFrom: r.ratioFrom,
        ratioTo: r.ratioTo,
        pricePerShare: r.pricePerShare,
        currency: r.currency,
        ...(r.payableDate !== undefined ? { payableDate: r.payableDate } : {}),
      }));
      return [...dividends, ...splits, ...rights].sort((a, b) => a.exDate.localeCompare(b.exDate));
    },
  };
}

export function dryRunEvidence(): CorporateActionsEvidence {
  return {
    source: 'dry-run://pi-corporate-actions',
    dataFreshness: 'offline',
  };
}
