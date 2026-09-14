export type FactorCategory = 'momentum' | 'value' | 'quality' | 'volatility' | 'size' | 'growth' | 'liquidity';

export type NormalizationMethod = 'zscore' | 'rank' | 'winsorize-zscore' | 'minmax';

export interface FactorBar {
  readonly date: string;
  readonly close: number;
  readonly volume?: number;
  readonly high?: number;
  readonly low?: number;
  readonly open?: number;
  readonly fundamental?: {
    readonly pe?: number;
    readonly pb?: number;
    readonly ps?: number;
    readonly roe?: number;
    readonly earningsYield?: number;
    readonly marketCap?: number;
    readonly revenueGrowth?: number;
    readonly earningsGrowth?: number;
    readonly grossMargin?: number;
    readonly debtToEquity?: number;
    readonly currentRatio?: number;
  };
}

export interface FactorDef {
  readonly id: string;
  readonly name: string;
  readonly category: FactorCategory;
  readonly description: string;
  readonly direction: 'long_high' | 'long_low';
}

export interface FactorResult {
  readonly factorId: string;
  readonly symbol: string;
  readonly date: string;
  readonly value: number;
}

export interface FactorSeries {
  readonly factorId: string;
  readonly symbol: string;
  readonly values: readonly number[];
  readonly dates: readonly string[];
}

export interface FactorSnapshot {
  readonly symbol: string;
  readonly date: string;
  readonly factors: ReadonlyMap<string, number>;
}

export interface UniverseSnapshot {
  readonly date: string;
  readonly symbols: readonly string[];
  readonly factorMatrix: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

export interface ICResult {
  readonly factorId: string;
  readonly icMean: number;
  readonly icStd: number;
  readonly icIR: number;
  readonly icSeries: readonly number[];
  readonly dates: readonly string[];
}

export interface FactorReturnsResult {
  readonly factorId: string;
  readonly meanReturn: number;
  readonly volatility: number;
  readonly sharpe: number;
  readonly cumulativeReturn: number;
  readonly periods: readonly { date: string; return: number; cumulative: number }[];
}

export interface FactorScore {
  readonly symbol: string;
  readonly date: string;
  readonly rawScore: number;
  readonly zScore: number;
  readonly rank: number;
  readonly factorContribs: ReadonlyMap<string, number>;
}

export interface FactorBacktestOptions {
  readonly startDate: string;
  readonly endDate: string;
  readonly rebalanceFreq: 'daily' | 'weekly' | 'monthly';
  readonly topN: number;
  readonly bottomN: number;
  readonly longShort: boolean;
}

export interface FactorBacktestResult {
  readonly factorId: string;
  readonly longReturn: number;
  readonly shortReturn: number;
  readonly longShortReturn: number;
  readonly sharpe: number;
  readonly maxDrawdown: number;
  readonly turnover: number;
  readonly equity: readonly { date: string; equity: number }[];
}

export interface QuantEvidence {
  readonly source: string;
  readonly dataFreshness: 'live' | 'cached' | 'offline';
}
