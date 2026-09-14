import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const HOSTS = '__upupPiHosts';
const PACKAGE = '@upup/pi-technical';
const VERSION = '0.1.0';

function registerHostTools(pi: ExtensionAPI): void {
  const hosts = (globalThis as typeof globalThis & { __upupPiHosts?: ReadonlyMap<string, { packageName: string; packageVersion: string; sessionId: string; capabilities: readonly string[] }> })[HOSTS];
  const host = hosts?.get(PACKAGE);
  if (!host || host.packageName !== PACKAGE || host.packageVersion !== VERSION || !host.sessionId) return;
}
import {
  computeAllIndicators,
  computeMACD,
  computeKDJ,
  computeBOLL,
  computeATR,
  computeRSI,
  computeOBV,
  computeCCI,
  type IndicatorBar,
} from '../src/index.js';

const barSchema = Type.Object({
  date: Type.String(),
  open: Type.Number(),
  high: Type.Number(),
  low: Type.Number(),
  close: Type.Number(),
  volume: Type.Optional(Type.Number()),
});

const computeIndicatorsParameters = Type.Object({
  symbol: Type.String({ minLength: 1, maxLength: 24, description: 'Symbol identifier (e.g. 600519.SH, 00700.HK)' }),
  bars: Type.Array(barSchema, { minItems: 1, maxItems: 5000 }),
  indicators: Type.Optional(Type.Array(Type.Union([
    Type.Literal('macd'), Type.Literal('kdj'), Type.Literal('boll'),
    Type.Literal('atr'), Type.Literal('rsi'), Type.Literal('obv'), Type.Literal('cci'),
  ]), { description: 'Subset of indicators to compute; default = all' })),
});

function text(value: unknown): string { return JSON.stringify(value, null, 2); }

export default function technicalExtension(pi: ExtensionAPI): void {
  registerHostTools(pi);
  pi.registerTool({
    name: 'compute_indicators',
    label: 'Compute technical indicators',
    description: 'Compute a technical indicator suite (MACD / KDJ / BOLL / ATR / RSI / OBV / CCI) from a bar series. Returns aligned arrays matching the input order; null for warmup periods.',
    parameters: computeIndicatorsParameters,
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_indicators aborted' }], isError: true };
      const suite = computeAllIndicators(params.bars as readonly IndicatorBar[]);
      const requested = new Set(params.indicators ?? ['macd', 'kdj', 'boll', 'atr', 'rsi', 'obv', 'cci']);
      const payload: Record<string, unknown> = {};
      if (requested.has('macd')) payload.macd = suite.macd;
      if (requested.has('kdj')) payload.kdj = suite.kdj;
      if (requested.has('boll')) payload.boll = suite.boll;
      if (requested.has('atr')) payload.atr = suite.atr;
      if (requested.has('rsi')) payload.rsi = suite.rsi;
      if (requested.has('obv')) payload.obv = suite.obv;
      if (requested.has('cci')) payload.cci = suite.cci;
      const value = { symbol: params.symbol, count: params.bars.length, indicators: payload };
      return {
        content: [{ type: 'text', text: text(value) }],
        details: { auditId: toolCallId, source: 'pi-technical://indicators', symbol: params.symbol, count: params.bars.length },
      };
    },
  });

  pi.registerTool({
    name: 'compute_macd',
    label: 'Compute MACD',
    description: 'Compute MACD (DIF / DEA / Histogram) for a single symbol bar series.',
    parameters: Type.Object({
      symbol: Type.String(),
      closes: Type.Array(Type.Number(), { minItems: 1 }),
      fastPeriod: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      slowPeriod: Type.Optional(Type.Integer({ minimum: 2, maximum: 200 })),
      signalPeriod: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_macd aborted' }], isError: true };
      const result = computeMACD(params.closes, params.fastPeriod ?? 12, params.slowPeriod ?? 26, params.signalPeriod ?? 9);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://macd' } };
    },
  });

  pi.registerTool({
    name: 'compute_kdj',
    label: 'Compute KDJ',
    description: 'Compute KDJ stochastic oscillator for a bar series.',
    parameters: Type.Object({
      symbol: Type.String(),
      bars: Type.Array(barSchema, { minItems: 1 }),
      n: Type.Optional(Type.Integer({ minimum: 1 })),
      kSmooth: Type.Optional(Type.Integer({ minimum: 1 })),
      dSmooth: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_kdj aborted' }], isError: true };
      const result = computeKDJ(params.bars as readonly IndicatorBar[], params.n ?? 9, params.kSmooth ?? 3, params.dSmooth ?? 3);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://kdj' } };
    },
  });

  pi.registerTool({
    name: 'compute_boll',
    label: 'Compute Bollinger Bands',
    description: 'Compute Bollinger Bands (upper / middle / lower / bandwidth) for a bar series.',
    parameters: Type.Object({
      symbol: Type.String(),
      closes: Type.Array(Type.Number(), { minItems: 1 }),
      period: Type.Optional(Type.Integer({ minimum: 2 })),
      stdDevMultiplier: Type.Optional(Type.Number({ minimum: 0.1 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_boll aborted' }], isError: true };
      const result = computeBOLL(params.closes, params.period ?? 20, params.stdDevMultiplier ?? 2);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://boll' } };
    },
  });

  pi.registerTool({
    name: 'compute_atr',
    label: 'Compute ATR',
    description: 'Compute Average True Range (ATR) using EMA smoothing.',
    parameters: Type.Object({
      symbol: Type.String(),
      bars: Type.Array(barSchema, { minItems: 1 }),
      period: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_atr aborted' }], isError: true };
      const result = computeATR(params.bars as readonly IndicatorBar[], params.period ?? 14);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://atr' } };
    },
  });

  pi.registerTool({
    name: 'compute_rsi',
    label: 'Compute RSI',
    description: 'Compute Relative Strength Index (RSI) using Wilder smoothing.',
    parameters: Type.Object({
      symbol: Type.String(),
      closes: Type.Array(Type.Number(), { minItems: 1 }),
      period: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_rsi aborted' }], isError: true };
      const result = computeRSI(params.closes, params.period ?? 14);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://rsi' } };
    },
  });

  pi.registerTool({
    name: 'compute_obv',
    label: 'Compute OBV',
    description: 'Compute On-Balance Volume (OBV) cumulative indicator.',
    parameters: Type.Object({
      symbol: Type.String(),
      bars: Type.Array(barSchema, { minItems: 1 }),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_obv aborted' }], isError: true };
      const result = computeOBV(params.bars as readonly IndicatorBar[]);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://obv' } };
    },
  });

  pi.registerTool({
    name: 'compute_cci',
    label: 'Compute CCI',
    description: 'Compute Commodity Channel Index (CCI) over a rolling window.',
    parameters: Type.Object({
      symbol: Type.String(),
      bars: Type.Array(barSchema, { minItems: 1 }),
      period: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    async execute(toolCallId, params, signal) {
      if (signal.aborted) return { content: [{ type: 'text', text: 'compute_cci aborted' }], isError: true };
      const result = computeCCI(params.bars as readonly IndicatorBar[], params.period ?? 20);
      return { content: [{ type: 'text', text: text(result) }], details: { auditId: toolCallId, source: 'pi-technical://cci' } };
    },
  });
}
