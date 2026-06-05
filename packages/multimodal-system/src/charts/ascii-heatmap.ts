/**
 * ASCII heatmap for 2D grids (correlations, sector performance, etc.).
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 *      (Requirement: ASCII Line and Heatmap Charts)
 *
 * Cells are colored with a diverging palette: red -> white -> green
 * mapped to the value's distance from zero (or from the median if
 * values are all positive, e.g. raw % changes).
 */

import { DEFAULT_CHART_OPTIONS, type ChartOptions, type HeatmapCell } from '@upup/types';

const RED = '\x1b[41m';
const RED_HI = '\x1b[101m';
const GREEN = '\x1b[42m';
const GREEN_HI = '\x1b[102m';
const NEUTRAL = '\x1b[47m';
const RESET = '\x1b[0m';

export interface HeatmapOptions extends ChartOptions {
  /** Cell width in characters. Default 4. */
  cellWidth?: number;
  /** Show row + column labels. Default true. */
  showLabels?: boolean;
  /** Format cell values (default `v.toFixed(2)`). */
  formatValue?: (v: number) => string;
}

/**
 * Color cells based on a diverging scale: -|max| → 0 → +|max| mapped to
 * red → neutral → green. 0 always renders as the neutral swatch.
 */
function colorFor(value: number, absMax: number, useColor: boolean): string {
  if (!useColor) return '  ';
  if (value === 0 || absMax === 0) return `${NEUTRAL}  ${RESET}`;
  const intensity = Math.min(1, Math.abs(value) / absMax);
  if (value > 0) return intensity > 0.5 ? `${GREEN_HI}  ${RESET}` : `${GREEN}  ${RESET}`;
  return intensity > 0.5 ? `${RED_HI}  ${RESET}` : `${RED}  ${RESET}`;
}

export function renderHeatmap(cells: HeatmapCell[], opts: HeatmapOptions = {}): string {
  const { color, cellWidth = 4, showLabels = true, formatValue } = { ...DEFAULT_CHART_OPTIONS, ...opts };
  if (cells.length === 0) return '(no data)';
  const rows = Array.from(new Set(cells.map((c) => c.row)));
  const cols = Array.from(new Set(cells.map((c) => c.col)));
  const valueMap = new Map<string, number>();
  for (const c of cells) valueMap.set(`${c.row}|${c.col}`, c.value);
  const values = cells.map((c) => c.value);
  const absMax = Math.max(...values.map((v) => Math.abs(v)));
  const fmt = formatValue ?? ((v: number) => v.toFixed(2));

  const lines: string[] = [];
  // Header row
  if (showLabels) {
    const header = ['    '].concat(cols.map((c) => c.slice(0, cellWidth).padStart(cellWidth))).join(' ');
    lines.push(header);
  }
  for (const row of rows) {
    const cellsText: string[] = [];
    if (showLabels) cellsText.push(row.slice(0, 4).padEnd(4));
    for (const col of cols) {
      const v = valueMap.get(`${row}|${col}`) ?? 0;
      const swatch = colorFor(v, absMax, color ?? true);
      const text = fmt(v).padStart(cellWidth);
      cellsText.push(`${swatch}${text}${RESET}`);
    }
    lines.push(cellsText.join(' '));
  }
  return lines.join('\n');
}
