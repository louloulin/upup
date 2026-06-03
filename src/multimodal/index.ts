/**
 * Multimodal output — ASCII charts and Markdown research reports.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 */

export {
  renderCandlestick,
  computeBoll,
  type CandleOptions,
  type MaOverlay,
  type BollOverlay,
  type RenderedChart,
  type BollBands,
} from './charts/ascii-candlestick.js';

export {
  renderLineChart,
  type LineSeries,
  type LineChartOptions,
} from './charts/ascii-line.js';

export {
  renderHeatmap,
  type HeatmapOptions,
} from './charts/ascii-heatmap.js';

export {
  renderResearchReport,
  type ResearchReportInput,
} from './reports/research-report.js';

export {
  DEFAULT_CHART_OPTIONS,
  candleDirection,
  type CandleDirection,
  type ChartOptions,
  type HeatmapCell,
  type LinePoint,
  type OhlcBar,
} from './types.js';

export const MULTIMODAL_DESCRIPTION = `
Multimodal output — ASCII charts and Markdown reports for the CLI.

## Charts
- \`render_candlestick\` — K-line (OHLC) with optional MA(n) and BOLL overlays
- \`render_line_chart\` — Time-series with multiple series support
- \`render_heatmap\` — 2D grid (correlations, sector performance) with diverging colors

## Reports
- \`render_research_report\` — Structured Markdown report with auto-filled sections

All output is plain ASCII + ANSI color codes, suitable for terminal display
and log capture. SVG / PNG rendering will be added later.
`;
