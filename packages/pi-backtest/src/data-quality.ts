import type { DailyBar } from './index';

export type BacktestDataQualityMode = 'strict' | 'permissive';

export interface BacktestDataQualityOptions {
  readonly mode?: BacktestDataQualityMode;
  readonly asOfDate?: string;
  readonly requireTradingDays?: boolean;
}

export interface BacktestDataQualityReport {
  readonly status: 'passed' | 'failed';
  readonly mode: BacktestDataQualityMode;
  readonly asOfDate?: string;
  readonly acceptedBarCount: number;
  readonly tradingDayCount: number;
  readonly firstBarDate?: string;
  readonly lastBarDate?: string;
  readonly issues: readonly string[];
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function tradingDay(value: string): boolean {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

export function validateForwardBars(
  analysisDate: string,
  bars: readonly DailyBar[],
  options: BacktestDataQualityOptions = {},
): BacktestDataQualityReport {
  const mode = options.mode ?? 'strict';
  if (mode === 'permissive') {
    return {
      status: 'passed',
      mode,
      ...(options.asOfDate ? { asOfDate: options.asOfDate } : {}),
      acceptedBarCount: bars.length,
      tradingDayCount: bars.filter((bar) => validDate(bar.date) && tradingDay(bar.date)).length,
      ...(bars[0]?.date ? { firstBarDate: bars[0].date } : {}),
      ...(bars.at(-1)?.date ? { lastBarDate: bars.at(-1)!.date } : {}),
      issues: [],
    };
  }
  const issues: string[] = [];
  if (!validDate(analysisDate)) issues.push('analysisDate must be an ISO calendar date');
  if (options.asOfDate !== undefined && !validDate(options.asOfDate)) issues.push('asOfDate must be an ISO calendar date');
  const requireTradingDays = options.requireTradingDays !== false;
  let previousDate: string | undefined;
  let acceptedBarCount = 0;
  let tradingDayCount = 0;
  for (const [index, bar] of bars.entries()) {
    if (!validDate(bar.date)) {
      issues.push(`bar[${index}].date must be an ISO calendar date`);
      continue;
    }
    if (bar.date <= analysisDate) issues.push(`bar[${index}].date must be after analysisDate`);
    if (options.asOfDate && bar.date > options.asOfDate) issues.push(`bar[${index}].date is after asOfDate`);
    if (previousDate && bar.date <= previousDate) issues.push(`bars must be strictly ordered and unique at ${bar.date}`);
    previousDate = bar.date;
    if (requireTradingDays && !tradingDay(bar.date)) issues.push(`bar[${index}].date is not a trading day`);
    if (bar.close !== undefined && (!Number.isFinite(bar.close) || bar.close <= 0)) issues.push(`bar[${index}].close must be finite and positive`);
    if (bar.high !== undefined && (!Number.isFinite(bar.high) || bar.high <= 0)) issues.push(`bar[${index}].high must be finite and positive`);
    if (bar.low !== undefined && (!Number.isFinite(bar.low) || bar.low <= 0)) issues.push(`bar[${index}].low must be finite and positive`);
    if (bar.high !== undefined && bar.low !== undefined && bar.high < bar.low) issues.push(`bar[${index}].high must not be lower than low`);
    if (bar.close !== undefined && bar.high !== undefined && bar.close > bar.high) issues.push(`bar[${index}].close must not exceed high`);
    if (bar.close !== undefined && bar.low !== undefined && bar.close < bar.low) issues.push(`bar[${index}].close must not be below low`);
    acceptedBarCount += 1;
    if (tradingDay(bar.date)) tradingDayCount += 1;
  }
  return {
    status: issues.length ? 'failed' : 'passed',
    mode,
    ...(options.asOfDate ? { asOfDate: options.asOfDate } : {}),
    acceptedBarCount,
    tradingDayCount,
    ...(bars[0]?.date ? { firstBarDate: bars[0].date } : {}),
    ...(bars.at(-1)?.date ? { lastBarDate: bars.at(-1)!.date } : {}),
    issues: [...new Set(issues)],
  };
}

