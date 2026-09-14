export type ActionType = 'dividend' | 'split' | 'rights_issue' | 'spinoff';

export type Currency = 'CNY' | 'HKD' | 'USD' | 'EUR' | 'JPY';

export interface CorporateAction {
  readonly symbol: string;
  readonly type: ActionType;
  readonly exDate: string;
  readonly recordDate?: string;
  readonly payableDate?: string;
  readonly announcementDate?: string;
  readonly currency?: Currency;
  readonly amountPerShare?: number;
  readonly ratioFrom?: number;
  readonly ratioTo?: number;
  readonly pricePerShare?: number;
  readonly notes?: string;
}

export interface DividendEvent {
  readonly symbol: string;
  readonly exDate: string;
  readonly amountPerShare: number;
  readonly currency: Currency;
  readonly payableDate?: string;
}

export interface SplitEvent {
  readonly symbol: string;
  readonly exDate: string;
  readonly ratioFrom: number;
  readonly ratioTo: number;
}

export interface RightsIssueEvent {
  readonly symbol: string;
  readonly exDate: string;
  readonly ratioFrom: number;
  readonly ratioTo: number;
  readonly pricePerShare: number;
  readonly currency: Currency;
  readonly payableDate?: string;
}

export interface AdjustedPriceBar {
  readonly date: string;
  readonly unadjustedClose: number;
  readonly adjustedClose: number;
  readonly adjustmentFactor: number;
}

export interface PriceAdjustmentOptions {
  readonly symbol: string;
  readonly method: 'back-adjust' | 'forward-adjust';
  readonly actions: readonly CorporateAction[];
}

export interface TotalReturnBreakdown {
  readonly priceReturn: number;
  readonly dividendReturn: number;
  readonly splitContribution: number;
  readonly rightsContribution: number;
  readonly totalReturn: number;
  readonly startPrice: number;
  readonly endPrice: number;
  readonly totalDividends: number;
  readonly splitsApplied: number;
  readonly rightsApplied: number;
}

export interface CorporateActionsClient {
  listDividends(symbol: string): Promise<readonly DividendEvent[]>;
  listSplits(symbol: string): Promise<readonly SplitEvent[]>;
  listRightsIssues(symbol: string): Promise<readonly RightsIssueEvent[]>;
  listAll(symbol: string): Promise<readonly CorporateAction[]>;
}

export interface CorporateActionsEvidence {
  readonly source: string;
  readonly dataFreshness: 'live' | 'cached' | 'offline';
}
