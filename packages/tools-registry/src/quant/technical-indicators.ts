/**
 * Technical Indicators Tool
 *
 * Implements 6 additional technical indicators:
 * - KDJ (Stochastic Oscillator)
 * - BOLL (Bollinger Bands)
 * - WR (Williams %R)
 * - CCI (Commodity Channel Index)
 * - ATR (Average True Range)
 * - OBV (On Balance Volume)
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorResult {
  indicator: string;
  values: Array<{ date: string; value: number | Record<string, number> }>;
  signal?: string;
}

// ============================================================================
// KDJ (Stochastic Oscillator)
// ============================================================================

function calculateKDJ(data: OHLCV[], kPeriod = 9, dPeriod = 3, jSmooth = 3): IndicatorResult {
  const values: IndicatorResult['values'] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < data.length; i++) {
    if (i < kPeriod - 1) continue;

    const slice = data.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...slice.map(d => d.high));
    const lowestLow = Math.min(...slice.map(d => d.low));
    const close = data[i].close;

    const rsv = highestHigh !== lowestLow
      ? ((close - lowestLow) / (highestHigh - lowestLow)) * 100
      : 50;

    const K = (2 / 3) * prevK + (1 / 3) * rsv;
    const D = (2 / 3) * prevD + (1 / 3) * K;
    const J = 3 * K - 2 * D;

    prevK = K;
    prevD = D;

    values.push({
      date: data[i].date,
      value: { K: Math.round(K * 100) / 100, D: Math.round(D * 100) / 100, J: Math.round(J * 100) / 100 },
    });
  }

  const last = values[values.length - 1];
  const lastVal = last?.value as Record<string, number>;
  let signal = 'NEUTRAL';
  if (lastVal) {
    if (lastVal.K > 80 && lastVal.D > 80) signal = 'OVERBOUGHT';
    else if (lastVal.K < 20 && lastVal.D < 20) signal = 'OVERSOLD';
    else if (lastVal.K > lastVal.D) signal = 'BULLISH';
    else signal = 'BEARISH';
  }

  return { indicator: 'KDJ', values: values.slice(-20), signal };
}

// ============================================================================
// BOLL (Bollinger Bands)
// ============================================================================

function calculateBOLL(data: OHLCV[], period = 20, stdDevMultiplier = 2): IndicatorResult {
  const values: IndicatorResult['values'] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const closes = slice.map(d => d.close);

    const sma = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = sma + stdDevMultiplier * stdDev;
    const lower = sma - stdDevMultiplier * stdDev;
    const bandwidth = sma !== 0 ? ((upper - lower) / sma) * 100 : 0;
    const percentB = upper !== lower ? (data[i].close - lower) / (upper - lower) * 100 : 50;

    values.push({
      date: data[i].date,
      value: {
        upper: Math.round(upper * 100) / 100,
        middle: Math.round(sma * 100) / 100,
        lower: Math.round(lower * 100) / 100,
        bandwidth: Math.round(bandwidth * 100) / 100,
        percentB: Math.round(percentB * 100) / 100,
      },
    });
  }

  const last = values[values.length - 1];
  const lastVal = last?.value as Record<string, number>;
  let signal = 'NEUTRAL';
  if (lastVal) {
    if (lastVal.percentB > 100) signal = 'ABOVE_UPPER_BAND';
    else if (lastVal.percentB < 0) signal = 'BELOW_LOWER_BAND';
    else if (lastVal.bandwidth < 5) signal = 'SQUEEZE';
  }

  return { indicator: 'BOLL', values: values.slice(-20), signal };
}

// ============================================================================
// WR (Williams %R)
// ============================================================================

function calculateWR(data: OHLCV[], period = 14): IndicatorResult {
  const values: IndicatorResult['values'] = [];

  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const highestHigh = Math.max(...slice.map(d => d.high));
    const lowestLow = Math.min(...slice.map(d => d.low));
    const close = data[i].close;

    const wr = highestHigh !== lowestLow
      ? ((highestHigh - close) / (highestHigh - lowestLow)) * -100
      : -50;

    values.push({
      date: data[i].date,
      value: Math.round(wr * 100) / 100,
    });
  }

  const last = values[values.length - 1];
  const lastVal = last?.value as number;
  let signal = 'NEUTRAL';
  if (lastVal > -20) signal = 'OVERBOUGHT';
  else if (lastVal < -80) signal = 'OVERSOLD';

  return { indicator: 'WR', values: values.slice(-20), signal };
}

// ============================================================================
// CCI (Commodity Channel Index)
// ============================================================================

function calculateCCI(data: OHLCV[], period = 20): IndicatorResult {
  const values: IndicatorResult['values'] = [];
  const typicalPrices = data.map(d => (d.high + d.low + d.close) / 3);

  for (let i = period - 1; i < data.length; i++) {
    const slice = typicalPrices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;

    const cci = meanDev !== 0
      ? (typicalPrices[i] - sma) / (0.015 * meanDev)
      : 0;

    values.push({
      date: data[i].date,
      value: Math.round(cci * 100) / 100,
    });
  }

  const last = values[values.length - 1];
  const lastVal = last?.value as number;
  let signal = 'NEUTRAL';
  if (lastVal > 100) signal = 'OVERBOUGHT';
  else if (lastVal < -100) signal = 'OVERSOLD';

  return { indicator: 'CCI', values: values.slice(-20), signal };
}

// ============================================================================
// ATR (Average True Range)
// ============================================================================

function calculateATR(data: OHLCV[], period = 14): IndicatorResult {
  const values: IndicatorResult['values'] = [];
  const trueRanges: number[] = [];

  for (let i = 0; i < data.length; i++) {
    let tr: number;
    if (i === 0) {
      tr = data[i].high - data[i].low;
    } else {
      tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
    }
    trueRanges.push(tr);
  }

  // First ATR = simple average of first 'period' TRs
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  values.push({
    date: data[period - 1].date,
    value: Math.round(atr * 100) / 100,
  });

  // Subsequent ATRs = exponential
  for (let i = period; i < data.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    values.push({
      date: data[i].date,
      value: Math.round(atr * 100) / 100,
    });
  }

  const last = values[values.length - 1];
  const lastVal = last?.value as number;
  const avgATR = values.slice(-10).reduce((s, v) => s + (v.value as number), 0) / Math.min(10, values.length);
  let signal = 'NORMAL';
  if (lastVal > avgATR * 1.5) signal = 'HIGH_VOLATILITY';
  else if (lastVal < avgATR * 0.5) signal = 'LOW_VOLATILITY';

  return { indicator: 'ATR', values: values.slice(-20), signal };
}

// ============================================================================
// OBV (On Balance Volume)
// ============================================================================

function calculateOBV(data: OHLCV[]): IndicatorResult {
  const values: IndicatorResult['values'] = [];
  let obv = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      obv = data[i].volume;
    } else {
      if (data[i].close > data[i - 1].close) {
        obv += data[i].volume;
      } else if (data[i].close < data[i - 1].close) {
        obv -= data[i].volume;
      }
      // If close === prevClose, OBV unchanged
    }

    values.push({
      date: data[i].date,
      value: Math.round(obv * 100) / 100,
    });
  }

  // Determine trend from last 5 values
  const recent = values.slice(-5);
  const obvValues = recent.map(v => v.value as number);
  let signal = 'NEUTRAL';
  if (obvValues.length >= 2) {
    const increasing = obvValues[obvValues.length - 1] > obvValues[0];
    signal = increasing ? 'BULLISH_DIVERGENCE' : 'BEARISH_DIVERGENCE';
  }

  return { indicator: 'OBV', values: values.slice(-20), signal };
}

// ============================================================================
// All Indicators
// ============================================================================

function calculateAllIndicators(data: OHLCV[]): IndicatorResult[] {
  return [
    calculateKDJ(data),
    calculateBOLL(data),
    calculateWR(data),
    calculateCCI(data),
    calculateATR(data),
    calculateOBV(data),
  ];
}

// ============================================================================
// Zod Schemas
// ============================================================================

const ohlcvDataSchema = z.object({
  data: z.array(z.object({
    date: z.string().describe('Date in YYYY-MM-DD format'),
    open: z.number().describe('Open price'),
    high: z.number().describe('High price'),
    low: z.number().describe('Low price'),
    close: z.number().describe('Close price'),
    volume: z.number().describe('Volume'),
  })).min(20).describe('Array of OHLCV data (at least 20 bars)'),
  indicators: z.array(z.enum(['kdj', 'boll', 'wr', 'cci', 'atr', 'obv'])).optional()
    .describe('Which indicators to calculate (default: all)'),
});

const singleIndicatorSchema = z.object({
  data: z.array(z.object({
    date: z.string().describe('Date'),
    open: z.number().describe('Open'),
    high: z.number().describe('High'),
    low: z.number().describe('Low'),
    close: z.number().describe('Close'),
    volume: z.number().describe('Volume'),
  })).min(14).describe('OHLCV data (at least 14 bars)'),
});

// ============================================================================
// Tools
// ============================================================================

export function createCalculateIndicatorsTool() {
  return new DynamicStructuredTool({
    name: 'calculate_technical_indicators',
    description: 'Calculate technical indicators (KDJ, BOLL, WR, CCI, ATR, OBV) from OHLCV data. Returns values with buy/sell signals.',
    schema: ohlcvDataSchema,
    func: async ({ data, indicators }) => {
      const requested = indicators || ['kdj', 'boll', 'wr', 'cci', 'atr', 'obv'];
      const results: Record<string, unknown>[] = [];

      const ohlcvData: OHLCV[] = data;

      if (requested.includes('kdj')) {
        const r = calculateKDJ(ohlcvData);
        results.push({
          indicator: 'KDJ (Stochastic)',
          signal: r.signal,
          latestValues: r.values[r.values.length - 1]?.value,
          description: 'K > 80/D > 80 = Overbought; K < 20/D < 20 = Oversold',
        });
      }

      if (requested.includes('boll')) {
        const r = calculateBOLL(ohlcvData);
        results.push({
          indicator: 'BOLL (Bollinger Bands)',
          signal: r.signal,
          latestValues: r.values[r.values.length - 1]?.value,
          description: 'Price near upper band = Overbought; near lower = Oversold; Squeeze = Breakout imminent',
        });
      }

      if (requested.includes('wr')) {
        const r = calculateWR(ohlcvData);
        results.push({
          indicator: 'WR (Williams %R)',
          signal: r.signal,
          latestValue: r.values[r.values.length - 1]?.value,
          description: 'WR > -20 = Overbought; WR < -80 = Oversold',
        });
      }

      if (requested.includes('cci')) {
        const r = calculateCCI(ohlcvData);
        results.push({
          indicator: 'CCI (Commodity Channel Index)',
          signal: r.signal,
          latestValue: r.values[r.values.length - 1]?.value,
          description: 'CCI > 100 = Overbought; CCI < -100 = Oversold',
        });
      }

      if (requested.includes('atr')) {
        const r = calculateATR(ohlcvData);
        results.push({
          indicator: 'ATR (Average True Range)',
          signal: r.signal,
          latestValue: r.values[r.values.length - 1]?.value,
          description: 'Higher ATR = Higher volatility; Used for stop-loss placement',
        });
      }

      if (requested.includes('obv')) {
        const r = calculateOBV(ohlcvData);
        results.push({
          indicator: 'OBV (On Balance Volume)',
          signal: r.signal,
          latestValue: r.values[r.values.length - 1]?.value,
          description: 'Rising OBV = Accumulation; Falling OBV = Distribution',
        });
      }

      return formatToolResult({
        type: 'Technical Indicators',
        dataPoints: data.length,
        indicatorsCalculated: results.length,
        results,
        summary: results.map(r => `${r.indicator}: ${r.signal}`).join(' | '),
      });
    },
  });
}

export function createCalculateKDJTool() {
  return new DynamicStructuredTool({
    name: 'calculate_kdj',
    description: 'Calculate KDJ (Stochastic Oscillator) indicator from OHLCV data.',
    schema: singleIndicatorSchema,
    func: async ({ data }) => {
      const result = calculateKDJ(data);
      return formatToolResult({
        type: 'KDJ Indicator',
        signal: result.signal,
        values: result.values.slice(-10),
        interpretation: result.signal === 'OVERBOUGHT' ? 'Consider selling - price may be too high'
          : result.signal === 'OVERSOLD' ? 'Consider buying - price may be too low'
          : result.signal === 'BULLISH' ? 'K line above D line - upward momentum'
          : 'K line below D line - downward momentum',
      });
    },
  });
}

export function createCalculateBOLLTool() {
  return new DynamicStructuredTool({
    name: 'calculate_boll',
    description: 'Calculate Bollinger Bands from OHLCV data. Returns upper/middle/lower bands with bandwidth and %B.',
    schema: singleIndicatorSchema,
    func: async ({ data }) => {
      const result = calculateBOLL(data);
      return formatToolResult({
        type: 'Bollinger Bands',
        signal: result.signal,
        values: result.values.slice(-10),
        interpretation: result.signal === 'SQUEEZE' ? 'Low volatility - breakout expected soon'
          : result.signal === 'ABOVE_UPPER_BAND' ? 'Price above upper band - potential reversal'
          : result.signal === 'BELOW_LOWER_BAND' ? 'Price below lower band - potential bounce'
          : 'Price within bands - normal range',
      });
    },
  });
}

export const technicalIndicatorTools = [
  createCalculateIndicatorsTool(),
  createCalculateKDJTool(),
  createCalculateBOLLTool(),
];
