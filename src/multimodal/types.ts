/**
 * Multimodal output shared types.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 */

export interface OhlcBar {
  /** ISO date (YYYY-MM-DD) or any sortable label. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface LinePoint {
  label: string;
  value: number;
}

export interface HeatmapCell {
  row: string;
  col: string;
  value: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  /** Use color escape codes (default: true). Disable for log-friendly output. */
  color?: boolean;
}

export const DEFAULT_CHART_OPTIONS = {
  width: 80,
  height: 20,
  color: true,
} as const;

export type CandleDirection = 'up' | 'down' | 'doji';

export function candleDirection(bar: OhlcBar): CandleDirection {
  if (bar.close > bar.open) return 'up';
  if (bar.close < bar.open) return 'down';
  return 'doji';
}
