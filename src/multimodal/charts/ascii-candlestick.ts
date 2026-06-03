/**
 * ASCII candlestick (K-line) chart.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 *      (Requirement: ASCII Candlestick Chart)
 *
 * Renders OHLC bars as ASCII art with optional moving-average (MA) and
 * Bollinger Bands (BOLL) overlays. Output fits a configurable terminal
 * width and uses ANSI color escape codes (toggleable) for up/down
 * direction.
 */

import {
  DEFAULT_CHART_OPTIONS,
  candleDirection,
  type CandleDirection,
  type ChartOptions,
  type OhlcBar,
} from '../types.js';

const UP = '\x1b[32m';
const DOWN = '\x1b[31m';
const MA_COLORS = ['\x1b[36m', '\x1b[35m', '\x1b[33m', '\x1b[34m'];
const RESET = '\x1b[0m';

export interface MaOverlay {
  period: number;
  label?: string;
}

export interface BollOverlay {
  period?: number;
  stddevMult?: number;
}

export interface CandleOptions extends ChartOptions {
  mas?: number[] | MaOverlay[];
  boll?: BollOverlay | boolean;
  legend?: boolean;
}

function sma(bars: OhlcBar[], period: number, idx: number): number | null {
  if (idx + 1 < period) return null;
  let sum = 0;
  for (let i = idx + 1 - period; i <= idx; i++) sum += bars[i]!.close;
  return sum / period;
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface BollBands {
  mid: (idx: number) => number | null;
  upper: (idx: number) => number | null;
  lower: (idx: number) => number | null;
}

export function computeBoll(bars: OhlcBar[], opts: BollOverlay = {}): BollBands {
  const period = opts.period ?? 20;
  const mult = opts.stddevMult ?? 2;
  return {
    mid: (i) => sma(bars, period, i),
    upper: (i) => {
      const m = sma(bars, period, i);
      if (m === null) return null;
      const closes: number[] = [];
      for (let j = i + 1 - period; j <= i; j++) closes.push(bars[j]!.close);
      return m + stdev(closes) * mult;
    },
    lower: (i) => {
      const m = sma(bars, period, i);
      if (m === null) return null;
      const closes: number[] = [];
      for (let j = i + 1 - period; j <= i; j++) closes.push(bars[j]!.close);
      return m - stdev(closes) * mult;
    },
  };
}

export interface RenderedChart {
  text: string;
  width: number;
  height: number;
  legend: string[];
}

function colorize(s: string, dir: CandleDirection, useColor: boolean): string {
  if (!useColor) return s;
  if (dir === 'up') return `${UP}${s}${RESET}`;
  if (dir === 'down') return `${DOWN}${s}${RESET}`;
  return s;
}

function colourizeLine(s: string, useColor: boolean, color = MA_COLORS[0]!): string {
  return useColor ? `${color}${s}${RESET}` : s;
}

export function renderCandlestick(bars: OhlcBar[], opts: CandleOptions = {}): RenderedChart {
  const { width, height, color } = { ...DEFAULT_CHART_OPTIONS, ...opts };
  if (bars.length === 0) return { text: '(no data)', width, height, legend: [] };

  const visible = bars.slice(-width);
  const allValues: number[] = [];
  for (const b of visible) allValues.push(b.high, b.low, b.open, b.close);
  const mas = (opts.mas ?? []).map((m) => (typeof m === 'number' ? { period: m, label: `MA${m}` } : m));
  for (let i = 0; i < visible.length; i++) {
    for (const m of mas) {
      const v = sma(visible, m.period, i);
      if (v !== null) allValues.push(v);
    }
  }
  if (opts.boll) {
    const boll = computeBoll(visible, typeof opts.boll === 'object' ? opts.boll : {});
    for (let i = 0; i < visible.length; i++) {
      const u = boll.upper(i);
      const l = boll.lower(i);
      const mm = boll.mid(i);
      if (u !== null) allValues.push(u);
      if (l !== null) allValues.push(l);
      if (mm !== null) allValues.push(mm);
    }
  }
  if (allValues.length === 0) return { text: '(no data)', width, height, legend: [] };
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const yToRow = (v: number) => Math.min(height - 1, Math.max(0, Math.round(((max - v) / range) * (height - 1))));

  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));
  const yLabels: string[] = [];
  for (let row = 0; row < height; row++) {
    yLabels.push((max - (range * row) / (height - 1)).toFixed(2));
  }

  for (let i = 0; i < visible.length; i++) {
    const bar = visible[i]!;
    const col = width - visible.length + i;
    const dir = candleDirection(bar);
    const hiRow = yToRow(bar.high);
    const loRow = yToRow(bar.low);
    const openRow = yToRow(bar.open);
    const closeRow = yToRow(bar.close);
    const bodyTop = Math.min(openRow, closeRow);
    const bodyBottom = Math.max(openRow, closeRow);
    for (let row = loRow; row <= hiRow; row++) {
      if (grid[row]![col] === ' ') grid[row]![col] = '│';
    }
    const bodyChar = dir === 'down' ? '█' : dir === 'up' ? '░' : '─';
    for (let row = bodyTop; row <= bodyBottom; row++) {
      grid[row]![col] = colorize(bodyChar, dir, color ?? true);
    }
  }

  const legendEntries: string[] = [];
  mas.forEach((m, mi) => {
    const colorIdx = mi % MA_COLORS.length;
    let prevRow: number | null = null;
    for (let i = 0; i < visible.length; i++) {
      const v = sma(visible, m.period, i);
      if (v === null) { prevRow = null; continue; }
      const row = yToRow(v);
      const col = width - visible.length + i;
      const ch = prevRow === null ? '•' : row === prevRow ? '─' : row < prevRow ? '╱' : '╲';
      grid[row]![col] = colourizeLine(ch, color ?? true, MA_COLORS[colorIdx]!);
      prevRow = row;
    }
    const last = sma(visible, m.period, visible.length - 1);
    if (last !== null) legendEntries.push(`${m.label}: ${last.toFixed(2)}`);
  });

  if (opts.boll) {
    const boll = computeBoll(visible, typeof opts.boll === 'object' ? opts.boll : {});
    const renderLine = (fn: (i: number) => number | null) => {
      let prevRow: number | null = null;
      for (let i = 0; i < visible.length; i++) {
        const v = fn(i);
        if (v === null) { prevRow = null; continue; }
        const row = yToRow(v);
        const col = width - visible.length + i;
        const ch = prevRow === null ? '•' : row === prevRow ? '─' : row < prevRow ? '╱' : '╲';
        grid[row]![col] = colourizeLine(ch, color ?? true, '\x1b[90m');
        prevRow = row;
      }
    };
    renderLine(boll.upper);
    renderLine(boll.mid);
    renderLine(boll.lower);
    const last = boll.upper(visible.length - 1);
    if (last !== null) legendEntries.push(`BOLL upper: ${last.toFixed(2)}`);
  }

  const labelWidth = Math.max(...yLabels.map((l) => l.length)) + 1;
  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    const label = yLabels[row]!.padStart(labelWidth);
    lines.push(label + ' │' + grid[row]!.join(''));
  }
  const first = visible[0]!.date;
  const last = visible[visible.length - 1]!.date;
  const axis = ' '.repeat(labelWidth) + ' └' + first.padEnd(width - first.length - last.length) + last;
  lines.push(axis);

  return {
    text: lines.join('\n'),
    width,
    height,
    legend: opts.legend === false ? [] : legendEntries,
  };
}
