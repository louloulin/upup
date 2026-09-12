/**
 * Migrated astock extension — pi-native `ToolDefinition` wrappers for
 * the astock tool family. Strict pi shape with TypeBox schemas,
 * `promptSnippet` + `promptGuidelines` per pi docs/extensions.md.
 *
 * Migration strategy (Pass 9):
 *   The existing tools in `src/tools/astock/*.ts` are LangChain
 *   `DynamicStructuredTool` instances with `zod` schemas. They are
 *   large, well-tested, and used by other parts of the system. The
 *   migrated wrappers here preserve the existing `func(input)`
 *   implementations unchanged (so we don't fork the data path) and
 *   re-expose the same tool under a strict pi `ToolDefinition` with a
 *   TypeBox schema. The pi runtime validates LLM tool calls against
 *   the TypeBox schema before invoking `execute`, and the inner
 *   LangChain tool's `zod` schema re-validates before the data call.
 *
 *   This is the Pass 9 prototype. Once the wrapper pattern is stable,
 *   future passes can either:
 *     (a) keep the adapter (low risk, two validations),
 *     (b) collapse the wrapper once the data path is migrated (zero
 *         dependency on LangChain).
 *
 * Tool inventory (Batch 2, Pass 9 prototypes):
 *   - get_astock_price     (S2: required code + optional enum period + 2 optional dates)
 *   - get_market_structure (S2: required enum type + 3 optional dates)
 */

import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { getAStockPrice } from '../tools/astock/get-astock-price.js';
import { getMarketStructure } from '../tools/astock/get-market-structure.js';

// ============================================================================
// get_astock_price — A-share price + K-line
// ============================================================================

/** K-line period: TypeBox-equivalent of zod's `z.enum(['daily','weekly','monthly'])`. */
const AStockPeriodSchema = Type.Union([
  Type.Literal('daily'),
  Type.Literal('weekly'),
  Type.Literal('monthly'),
]);

export const getAStockPriceParams = Type.Object({
  /** Tushare code (e.g. 002594.SZ), 6-digit code, or company name (e.g. "比亚迪", "腾讯"). */
  code: Type.String({
    description: 'Stock code in Tushare format (e.g. 002594.SZ, 600519.SH, 300750.SZ), 6-digit code, or company name (e.g. "比亚迪", "腾讯").',
    minLength: 1,
  }),
  /** K-line period. Default `daily`. */
  period: Type.Optional(AStockPeriodSchema),
  /** Start date YYYYMMDD, e.g. 20240101. */
  start_date: Type.Optional(Type.String({ description: 'Start date (YYYYMMDD, e.g. 20240101).' })),
  /** End date YYYYMMDD. Default: today. */
  end_date: Type.Optional(Type.String({ description: 'End date (YYYYMMDD, default: today).' })),
});

export type GetAStockPriceParams = Static<typeof getAStockPriceParams>;

/** Shape returned by the inner LangChain tool — wrapped as `{ content, details }`. */
export interface AStockPriceDetails {
  /** Source of the price data — Tushare / Tencent / Sina. */
  source?: string;
  /** Resolved Tushare code (e.g. 002594.SZ). */
  ts_code?: string;
  /** K-line period used. */
  period?: string;
  /** Number of rows in `data`. */
  count?: number;
  /** Raw rows from the underlying API. */
  data?: unknown;
  /** Error payload — present only on full failure. */
  error?: string;
  /** List of sources tried. */
  sources_tried?: string[];
  /** Last error message (if any). */
  last_error?: string;
  /** Suggestion string for the LLM. */
  suggestion?: string;
}

/** Migrated strict pi `ToolDefinition` for `get_astock_price`. */
export function createGetAStockPriceTool() {
  return defineTool({
    name: 'get_astock_price',
    label: 'Get AStock Price',
    description: `Fetch real-time price and K-line data for A-share (Chinese) stocks and HK stocks.

Supported exchanges: Shanghai (SH: 600/601/603/688), Shenzhen (SZ: 000/002/300/301), Beijing (BJ: 92/43/83/87/88), HK (e.g. 00700.HK, 1211.HK).

Input: Tushare-format code (002594.SZ), 6-digit code, or company name (比亚迪, 贵州茅台, 宁德时代).`,
    promptSnippet: 'Get A-share price + K-line (daily/weekly/monthly) by code or company name',
    promptGuidelines: [
      'Use get_astock_price for A-share (6-digit codes like 002594, 600519, 300750) or HK stocks (e.g. 00700.HK), or any Chinese stock referenced by name (比亚迪, 贵州茅台, 宁德时代).',
      "Prefer get_astock_price over get_realtime_quote when the user wants historical K-line (start_date + end_date) rather than the current tick. For a single current quote use get_realtime_quote instead.",
    ],
    parameters: getAStockPriceParams,
    async execute(
      _toolCallId,
      params: GetAStockPriceParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: AStockPriceDetails }> {
      // Delegate to the existing LangChain tool — it already handles
      // name → code resolution, Tushare token gating, and multi-source
      // fallback (Tushare → Tencent → Sina).
      const json = (await getAStockPrice.func({
        code: params.code,
        period: params.period,
        start_date: params.start_date,
        end_date: params.end_date,
      })) as string;

      let details: AStockPriceDetails;
      try {
        details = JSON.parse(json);
      } catch {
        details = { error: 'Failed to parse response', data: json };
      }

      return {
        content: [{ type: 'text', text: json }],
        details,
      };
    },
  });
}

// ============================================================================
// get_market_structure — Dragon-tiger, HSGT, money flow, margin
// ============================================================================

/** Market structure data type — string enum at the TypeBox level. */
const MarketStructureTypeSchema = Type.Union([
  Type.Literal('top_list'),
  Type.Literal('hsgt'),
  Type.Literal('moneyflow'),
  Type.Literal('margin'),
]);

export const getMarketStructureParams = Type.Object({
  /** Required data type discriminator. */
  type: MarketStructureTypeSchema,
  /** Trade date YYYYMMDD. */
  trade_date: Type.Optional(Type.String({ description: 'Trade date (YYYYMMDD, default: today).' })),
  /** Start date YYYYMMDD. */
  start_date: Type.Optional(Type.String({ description: 'Start date (YYYYMMDD).' })),
  /** End date YYYYMMDD. */
  end_date: Type.Optional(Type.String({ description: 'End date (YYYYMMDD, default: today).' })),
});

export type GetMarketStructureParams = Static<typeof getMarketStructureParams>;

/** Shape returned by `get_market_structure`. */
export interface MarketStructureDetails {
  source?: string;
  /** Discriminated payload — what data type was returned. */
  type?: string;
  trade_date?: string;
  start_date?: string;
  end_date?: string;
  count?: number;
  data?: unknown;
  /** Error payload when TUSHARE_TOKEN is missing. */
  error?: string;
  hint?: string;
}

/** Migrated strict pi `ToolDefinition` for `get_market_structure`. */
export function createGetMarketStructureTool() {
  return defineTool({
    name: 'get_market_structure',
    label: 'Get Market Structure',
    description: `Fetch A-share market structure data: dragon-tiger list (龙虎榜), HSGT (北向资金), money flow (资金流向), margin trading (融资融券).

Data types: top_list (龙虎榜), hsgt (北向资金), moneyflow (资金流), margin (融资融券).`,
    promptSnippet: 'Get A-share market structure (dragon-tiger / HSGT / money flow / margin)',
    promptGuidelines: [
      'Use get_market_structure when the user asks about institutional flows, dragon-tiger list (龙虎榜), northbound capital (北向资金 / HSGT), sector money flow, or margin trading activity.',
      "For individual stock price/K-line use get_astock_price instead — get_market_structure is for market-level structure data only.",
    ],
    parameters: getMarketStructureParams,
    async execute(
      _toolCallId,
      params: GetMarketStructureParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: MarketStructureDetails }> {
      const json = (await getMarketStructure.func({
        type: params.type,
        trade_date: params.trade_date,
        start_date: params.start_date,
        end_date: params.end_date,
      })) as string;

      let details: MarketStructureDetails;
      try {
        details = JSON.parse(json);
      } catch {
        details = { error: 'Failed to parse response', data: json };
      }

      return {
        content: [{ type: 'text', text: json }],
        details,
      };
    },
  });
}