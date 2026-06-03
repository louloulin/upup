/**
 * Tests for the multimodal output module.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/multimodal-output
 */

import { describe, expect, test } from 'bun:test';
import { computeBoll, renderCandlestick } from './charts/ascii-candlestick.js';
import { renderHeatmap } from './charts/ascii-heatmap.js';
import { renderLineChart } from './charts/ascii-line.js';
import { renderResearchReport } from './reports/research-report.js';
import { candleDirection, type OhlcBar } from './types.js';

const NO_COLOR = { color: false };

function makeBars(n: number, start = 100, drift = 0.5): OhlcBar[] {
  const bars: OhlcBar[] = [];
  for (let i = 0; i < n; i++) {
    const o = start + i * drift;
    const c = o + drift * 0.5;
    bars.push({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: o,
      close: c,
      high: Math.max(o, c) + 1,
      low: Math.min(o, c) - 1,
      volume: 1_000_000,
    });
  }
  return bars;
}

describe('candleDirection', () => {
  test('up when close > open', () => {
    expect(candleDirection({ date: '', open: 1, high: 2, low: 0.5, close: 1.5 })).toBe('up');
  });
  test('down when close < open', () => {
    expect(candleDirection({ date: '', open: 2, high: 2.5, low: 1.5, close: 1.5 })).toBe('down');
  });
  test('doji when close == open', () => {
    expect(candleDirection({ date: '', open: 1, high: 1.1, low: 0.9, close: 1 })).toBe('doji');
  });
});

describe('renderCandlestick', () => {
  test('renders a non-empty chart for 30 bars with MA(5)/MA(10)/MA(20)', () => {
    const bars = makeBars(30);
    const r = renderCandlestick(bars, { ...NO_COLOR, mas: [5, 10, 20], width: 60, height: 12 });
    expect(r.text).not.toBe('(no data)');
    expect(r.text).toContain('│');
    expect(r.legend.length).toBe(3);
    expect(r.legend[0]).toMatch(/MA5/);
    expect(r.legend[1]).toMatch(/MA10/);
    expect(r.legend[2]).toMatch(/MA20/);
  });

  test('renders empty for no bars', () => {
    const r = renderCandlestick([], NO_COLOR);
    expect(r.text).toBe('(no data)');
  });

  test('truncates to width when more bars than columns', () => {
    const bars = makeBars(100);
    const r = renderCandlestick(bars, { ...NO_COLOR, width: 20, height: 10 });
    // The axis line should show only 20 chars of bar
    const axisLine = r.text.split('\n').pop() ?? '';
    const chartStart = axisLine.indexOf('└');
    expect(chartStart).toBeGreaterThanOrEqual(0);
  });

  test('color:false output contains no ANSI escape codes', () => {
    const r = renderCandlestick(makeBars(10), { ...NO_COLOR, mas: [5] });
    expect(r.text).not.toMatch(/\x1b\[/);
  });

  test('Bollinger bands overlay renders and reports upper band in legend', () => {
    const r = renderCandlestick(makeBars(40), { ...NO_COLOR, boll: { period: 10, stddevMult: 2 }, width: 40, height: 10 });
    expect(r.text).not.toBe('(no data)');
    expect(r.legend.some((l) => l.includes('BOLL'))).toBe(true);
  });

  test('computeBoll produces symmetric upper/lower around the SMA', () => {
    const bars = makeBars(30, 100, 0.3);
    const boll = computeBoll(bars, { period: 20, stddevMult: 2 });
    const last = bars.length - 1;
    const u = boll.upper(last)!;
    const m = boll.mid(last)!;
    const l = boll.lower(last)!;
    expect(u).toBeGreaterThan(m);
    expect(l).toBeLessThan(m);
    expect(Math.abs((u - m) - (m - l))).toBeLessThan(1e-6);
  });
});

describe('renderLineChart', () => {
  test('renders single-series time series with last value in legend', () => {
    const points = [
      { label: '2024-01-01', value: 100 },
      { label: '2024-01-02', value: 102 },
      { label: '2024-01-03', value: 105 },
      { label: '2024-01-04', value: 101 },
    ];
    const out = renderLineChart(points, { ...NO_COLOR, width: 40, height: 8 });
    expect(out).toContain('value 2024-01-04: 101.00');
    expect(out).toContain('│');
  });

  test('renders multi-series with distinct names in legend', () => {
    const out = renderLineChart(
      [
        { name: 'A', points: [{ label: 't1', value: 1 }, { label: 't2', value: 2 }] },
        { name: 'B', points: [{ label: 't1', value: 2 }, { label: 't2', value: 1 }] },
      ],
      { ...NO_COLOR, width: 20, height: 6 },
    );
    expect(out).toMatch(/A/);
    expect(out).toMatch(/B/);
  });

  test('returns placeholder for empty input', () => {
    expect(renderLineChart([], NO_COLOR)).toBe('(no data)');
    expect(
      renderLineChart([{ name: 'A', points: [] }], NO_COLOR),
    ).toBe('(no data)');
  });

  test('legend:false suppresses the legend block', () => {
    const out = renderLineChart(
      [{ label: 'a', value: 1 }],
      { ...NO_COLOR, legend: false },
    );
    expect(out).not.toMatch(/a: 1\.00/);
  });
});

describe('renderHeatmap', () => {
  test('renders a 2x2 grid with diverging colors', () => {
    const cells = [
      { row: 'tech', col: 'A', value: 2 },
      { row: 'tech', col: 'B', value: -1 },
      { row: 'bank', col: 'A', value: 0.5 },
      { row: 'bank', col: 'B', value: -2.5 },
    ];
    const out = renderHeatmap(cells, { ...NO_COLOR, cellWidth: 4 });
    expect(out).toContain('tech');
    expect(out).toContain('bank');
    expect(out).toContain('A');
    expect(out).toContain('B');
  });

  test('returns placeholder for empty input', () => {
    expect(renderHeatmap([], NO_COLOR)).toBe('(no data)');
  });

  test('formatValue override customizes the cell text', () => {
    const out = renderHeatmap(
      [{ row: 'r', col: 'c', value: 0.123 }],
      { ...NO_COLOR, formatValue: (v) => `${(v * 100).toFixed(1)}%` },
    );
    expect(out).toMatch(/12\.3%/);
  });

  test('handles all-positive values (no negatives) by mapping to green palette', () => {
    const out = renderHeatmap(
      [
        { row: 'r1', col: 'c1', value: 0.5 },
        { row: 'r1', col: 'c2', value: 2 },
      ],
      { ...NO_COLOR },
    );
    // Just assert it doesn't crash and contains the cell text.
    expect(out).toContain('0.50');
    expect(out).toContain('2.00');
  });
});

describe('renderResearchReport', () => {
  test('renders all 8 sections even when no data is provided', () => {
    const r = renderResearchReport({ symbol: 'TEST' });
    expect(r).toContain('# TEST 投资分析报告');
    expect(r).toContain('## 摘要');
    expect(r).toContain('## 基本面');
    expect(r).toContain('## 技术面');
    expect(r).toContain('## 估值');
    expect(r).toContain('## 资金流');
    expect(r).toContain('## 情绪');
    expect(r).toContain('## 风险');
    expect(r).toContain('## 建议');
  });

  test('marks missing fields with 未提供 rather than empty', () => {
    const r = renderResearchReport({ symbol: 'X' });
    expect(r).toMatch(/未提供/);
  });

  test('fills provided fields verbatim', () => {
    const r = renderResearchReport({
      symbol: '600519.SH',
      name: '贵州茅台',
      summary: 'Strong brand moat.',
      recommendation: { action: 'BUY', targetPrice: '2000', positionSize: '5%', stopLoss: '1700', confidence: 0.85 },
      risks: ['Macro slowdown', 'Regulatory risk'],
    });
    expect(r).toContain('贵州茅台 (600519.SH)');
    expect(r).toContain('Strong brand moat.');
    expect(r).toContain('**BUY**');
    expect(r).toContain('2000');
    expect(r).toContain('- Macro slowdown');
    expect(r).toContain('- Regulatory risk');
    expect(r).toContain('0.85');
  });

  test('handles BUY/HOLD/SELL/WATCH actions', () => {
    for (const action of ['BUY', 'HOLD', 'SELL', 'WATCH'] as const) {
      const r = renderResearchReport({
        symbol: 'X',
        recommendation: { action },
      });
      expect(r).toContain(`**${action}**`);
    }
  });

  test('renders catalysts as a bullet list', () => {
    const r = renderResearchReport({
      symbol: 'X',
      sentiment: { catalysts: ['Earnings beat', 'New product launch'] },
    });
    expect(r).toMatch(/- Earnings beat/);
    expect(r).toMatch(/- New product launch/);
  });
});
