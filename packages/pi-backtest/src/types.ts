/**
 * Shared backtest types — extracted from `index.ts` so that
 * `microstructure.ts` and `data-quality.ts` can both import them
 * without inducing a 3-cycle through the barrel re-exports.
 */

export interface DailyBar {
  readonly date: string;
  readonly high?: number;
  readonly low?: number;
  readonly close?: number;
}
