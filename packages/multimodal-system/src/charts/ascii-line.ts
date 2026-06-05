/**
 * ASCII line chart for time-series data.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 *      (Requirement: ASCII Line and Heatmap Charts)
 *
 * Lightweight renderer that maps a list of label/value pairs to an ASCII
 * grid. Multiple series can be overlaid by passing an array of series
 * arrays; the renderer auto-assigns distinct colors from a fixed palette.
 */

import { DEFAULT_CHART_OPTIONS, type ChartOptions, type LinePoint } from '@upup/types';

const SERIES_COLORS = [
  '\x1b[36m', // cyan
  '\x1b[35m', // magenta
  '\x1b[33m', // yellow
  '\x1b[34m', // blue
  '\x1b[32m', // green
  '\x1b[31m', // red
];
const RESET = '\x1b[0m';

export interface LineSeries {
  name: string;
  points: LinePoint[];
  color?: string;
}

export interface LineChartOptions extends ChartOptions {
  /** Show a legend row with series names + last values. Default true. */
  legend?: boolean;
  /** Use block characters (default true). */
  useBlocks?: boolean;
}

export function renderLineChart(
  input: LinePoint[] | LineSeries[],
  opts: LineChartOptions = {},
): string {
  const { width, height, color } = { ...DEFAULT_CHART_OPTIONS, ...opts };
  const series: LineSeries[] = Array.isArray(input) && input.length > 0 && 'points' in (input[0] as LineSeries)
    ? (input as LineSeries[])
    : [{ name: 'value', points: input as LinePoint[] }];

  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return '(no data)';
  }

  const allValues: number[] = series.flatMap((s) => s.points.map((p) => p.value));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const yToRow = (v: number) =>
    Math.min(height - 1, Math.max(0, Math.round(((max - v) / range) * (height - 1))));

  const grid: string[][] = Array.from({ length: height }, () => Array(width).fill(' '));
  const yLabels: string[] = [];
  for (let row = 0; row < height; row++) {
    const v = max - (range * row) / (height - 1);
    yLabels.push(v.toFixed(2));
  }

  series.forEach((s, si) => {
    const useColor = color ?? true;
    const colorCode = useColor ? (s.color ?? SERIES_COLORS[si % SERIES_COLORS.length]!) : '';
    const reset = useColor ? RESET : '';
    if (s.points.length === 0) return;
    const visible = s.points.slice(-width);
    let prevRow: number | null = null;
    for (let i = 0; i < visible.length; i++) {
      const row = yToRow(visible[i]!.value);
      const col = width - visible.length + i;
      const ch = prevRow === null ? '•' : row === prevRow ? '─' : row < prevRow ? '╱' : '╲';
      grid[row]![col] = `${colorCode}${ch}${reset}`;
      prevRow = row;
    }
  });

  const labelWidth = Math.max(...yLabels.map((l) => l.length)) + 1;
  const lines: string[] = [];
  for (let row = 0; row < height; row++) {
    const label = yLabels[row]!.padStart(labelWidth);
    lines.push(label + ' │' + grid[row]!.join(''));
  }
  // X-axis: first / last label
  const firstSeries = series.find((s) => s.points.length > 0)!;
  const first = firstSeries.points[0]!.label;
  const last = firstSeries.points[firstSeries.points.length - 1]!.label;
  lines.push(' '.repeat(labelWidth) + ' └' + first.padEnd(Math.max(0, width - first.length - last.length)) + last);

  if (opts.legend !== false) {
    const legend = series
      .map((s, si) => {
        const useColor = color ?? true;
        const last = s.points[s.points.length - 1];
        const lastStr = last ? `${last.label}: ${last.value.toFixed(2)}` : '(empty)';
        const tag = useColor ? `${s.color ?? SERIES_COLORS[si % SERIES_COLORS.length]!}${s.name}${RESET}` : s.name;
        return `${tag} ${lastStr}`;
      })
      .join('  ');
    lines.push('');
    lines.push(legend);
  }
  return lines.join('\n');
}
