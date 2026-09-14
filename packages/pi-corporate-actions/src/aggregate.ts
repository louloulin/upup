import type {
  CorporateAction,
  DividendEvent,
  RightsIssueEvent,
  SplitEvent,
  TotalReturnBreakdown,
} from './types.js';
import { sortSplitsChronologically } from './splits.js';

export interface TotalReturnOptions {
  readonly symbol: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startPrice: number;
  readonly endPrice: number;
  readonly dividends: readonly DividendEvent[];
  readonly splits: readonly SplitEvent[];
  readonly rightsIssues: readonly RightsIssueEvent[];
}

export function computeTotalReturn(options: TotalReturnOptions): TotalReturnBreakdown {
  if (options.startPrice <= 0) {
    throw new Error('startPrice must be > 0');
  }

  const splitsInRange = sortSplitsChronologically(options.splits).filter(
    (s) => s.exDate >= options.startDate && s.exDate <= options.endDate,
  );
  const dividendsInRange = options.dividends.filter(
    (d) => d.exDate >= options.startDate && d.exDate <= options.endDate,
  );
  const rightsInRange = options.rightsIssues.filter(
    (r) => r.exDate >= options.startDate && r.exDate <= options.endDate,
  );

  const totalDividends = dividendsInRange.reduce((sum, d) => sum + d.amountPerShare, 0);

  let splitContribution = 0;
  for (const s of splitsInRange) {
    if (s.ratioFrom > 0 && s.ratioTo > s.ratioFrom) {
      splitContribution += (s.ratioTo / s.ratioFrom) - 1;
    }
  }

  let rightsContribution = 0;
  for (const r of rightsInRange) {
    if (r.ratioFrom > 0) {
      const ratio = r.ratioTo / r.ratioFrom;
      if (r.pricePerShare < options.endPrice) {
        rightsContribution += ratio * (r.pricePerShare / options.endPrice - 1);
      }
    }
  }

  const priceReturn = (options.endPrice - options.startPrice) / options.startPrice;
  const dividendReturn = totalDividends / options.startPrice;
  const totalReturn = priceReturn + dividendReturn + splitContribution + rightsContribution;

  return {
    priceReturn,
    dividendReturn,
    splitContribution,
    rightsContribution,
    totalReturn,
    startPrice: options.startPrice,
    endPrice: options.endPrice,
    totalDividends,
    splitsApplied: splitsInRange.length,
    rightsApplied: rightsInRange.length,
  };
}

export function aggregateActions(actions: readonly CorporateAction[]): {
  readonly dividends: DividendEvent[];
  readonly splits: SplitEvent[];
  readonly rightsIssues: RightsIssueEvent[];
} {
  const dividends: DividendEvent[] = [];
  const splits: SplitEvent[] = [];
  const rightsIssues: RightsIssueEvent[] = [];

  for (const a of actions) {
    if (a.type === 'dividend' && a.amountPerShare !== undefined) {
      dividends.push({
        symbol: a.symbol,
        exDate: a.exDate,
        amountPerShare: a.amountPerShare,
        currency: a.currency ?? 'CNY',
        ...(a.payableDate !== undefined ? { payableDate: a.payableDate } : {}),
      });
    } else if (a.type === 'split' && a.ratioFrom !== undefined && a.ratioTo !== undefined) {
      splits.push({
        symbol: a.symbol,
        exDate: a.exDate,
        ratioFrom: a.ratioFrom,
        ratioTo: a.ratioTo,
      });
    } else if (a.type === 'rights_issue' && a.ratioFrom !== undefined && a.ratioTo !== undefined && a.pricePerShare !== undefined) {
      rightsIssues.push({
        symbol: a.symbol,
        exDate: a.exDate,
        ratioFrom: a.ratioFrom,
        ratioTo: a.ratioTo,
        pricePerShare: a.pricePerShare,
        currency: a.currency ?? 'CNY',
        ...(a.payableDate !== undefined ? { payableDate: a.payableDate } : {}),
      });
    }
  }

  return {
    dividends: dividends.sort((a, b) => a.exDate.localeCompare(b.exDate)),
    splits: sortSplitsChronologically(splits),
    rightsIssues: rightsIssues.sort((a, b) => a.exDate.localeCompare(b.exDate)),
  };
}
