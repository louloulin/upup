/**
 * Shared screening types.
 *
 * These live outside `./natural-language-screen` and `./screen-eastmoney` so the
 * parser/scorer and the provider readers can share them without an import cycle
 * (same reason `./market-types` exists for the quote/history modules).
 */

export type ScreenUniverse = 'us' | 'cn' | 'hk' | 'crypto';
export type ScreenFilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'between' | 'in' | 'not-in';
export type ScreenScalar = string | number;

export interface ScreenFilterClause {
  field: string;
  op: ScreenFilterOp;
  value: ScreenScalar | [ScreenScalar, ScreenScalar] | ScreenScalar[];
}

/** Metrics are optional because a real provider only carries the fields it really has. */
export interface ScreenStockRow {
  ticker: string;
  name: string;
  sector: string;
  market?: string;
  marketCap?: number;
  pe?: number;
  pb?: number;
  roe?: number;
  revenueGrowth?: number;
  profitGrowth?: number;
  dividendYield?: number;
  changePercent?: number;
  rsi?: number;
  priceChange1y?: number;
}
