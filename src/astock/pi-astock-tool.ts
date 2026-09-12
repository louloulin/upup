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
 *   This is the Pass 9 migration. Future passes can either:
 *     (a) keep the adapter (low risk, two validations),
 *     (b) collapse the wrapper once the data path is migrated (zero
 *         dependency on LangChain).
 *
 * Tool inventory (Batch 2, Pass 9 — full migration of 7 tools):
 *   - get_astock_price     (S2: required code + optional enum period + 2 optional dates)
 *   - get_astock_financials(S2: required code + 3 optional fields)
 *   - get_astock_news      (S1: optional code as union(string | 'market'))
 *   - get_market_structure (S2: required enum type + 3 optional dates)
 *   - get_sector_data      (S1: optional code + optional enum type)
 *   - get_technical_data   (S2: required code + optional enum period + 2 optional dates)
 *   - screen_astocks       (S2: optional sector + optional exchange + optional numerics)
 */

import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { getAStockPrice } from '../tools/astock/get-astock-price.js';
import { getAStockFinancials } from '../tools/astock/get-astock-financials.js';
import { getAStockNews } from '../tools/astock/get-astock-news.js';
import { getMarketStructure } from '../tools/astock/get-market-structure.js';
import { getSectorData } from '../tools/astock/get-sector-data.js';
import { getTechnicalData } from '../tools/astock/get-technical-data.js';
import { screenAstocks } from '../tools/astock/screen-astocks.js';

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

// ============================================================================
// get_astock_financials — Income / balance sheet / cashflow
// ============================================================================

export const getAStockFinancialsParams = Type.Object({
  /** Stock code or company name. */
  code: Type.String({
    description: 'Stock code in Tushare format (e.g. 002594.SZ, 600519.SH), 6-digit code, or company name (e.g. "比亚迪", "贵州茅台").',
    minLength: 1,
  }),
  /** Fiscal period (e.g. 2024 for annual, 202403 for Q1). */
  period: Type.Optional(Type.String({ description: 'Fiscal period (e.g. 2024 for annual, 202403 for Q1).' })),
  /** Start date YYYYMMDD. */
  start_date: Type.Optional(Type.String({ description: 'Start date (YYYYMMDD).' })),
  /** End date YYYYMMDD. */
  end_date: Type.Optional(Type.String({ description: 'End date (YYYYMMDD).' })),
});

export type GetAStockFinancialsParams = Static<typeof getAStockFinancialsParams>;

/** Shape returned by `get_astock_financials`. */
export interface AStockFinancialsDetails {
  source?: string;
  ts_code?: string;
  income?: { count: number; latest?: Record<string, unknown> };
  balance_sheet?: { count: number; latest?: Record<string, unknown> };
  cashflow?: { count: number; latest?: Record<string, unknown> };
  error?: string;
  hint?: string;
  api_status?: Record<string, string>;
  suggestion?: string;
  note?: string;
}

/** Migrated strict pi `ToolDefinition` for `get_astock_financials`. */
export function createGetAStockFinancialsTool() {
  return defineTool({
    name: 'get_astock_financials',
    label: 'Get AStock Financials',
    description: `Fetch financial statements (income / balance sheet / cashflow) for A-share (Chinese) stocks.

Input: Tushare-format code (002594.SZ), 6-digit code, or company name (比亚迪, 贵州茅台, 宁德时代).`,
    promptSnippet: 'Get A-share income statement / balance sheet / cashflow',
    promptGuidelines: [
      'Use get_astock_financials for revenue, net income, EPS, ROE, balance sheet, or cash flow data on A-share stocks.',
      'Financial statements require a paid Tushare Pro permission — if the call returns a permission error, fall back to fundamentals from get_astock_price or external sources.',
    ],
    parameters: getAStockFinancialsParams,
    async execute(
      _toolCallId,
      params: GetAStockFinancialsParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: AStockFinancialsDetails }> {
      const json = (await getAStockFinancials.func({
        code: params.code,
        period: params.period,
        start_date: params.start_date,
        end_date: params.end_date,
      })) as string;

      let details: AStockFinancialsDetails;
      try {
        details = JSON.parse(json);
      } catch {
        details = { error: 'Failed to parse response', source: json };
      }

      return {
        content: [{ type: 'text', text: json }],
        details,
      };
    },
  });
}

// ============================================================================
// get_astock_news — Company announcements + market news
// ============================================================================

export const getAStockNewsParams = Type.Object({
  /** Stock code or "market" for general news. Optional. */
  code: Type.Optional(
    Type.String({
      description: 'Stock code in Tushare format, 6-digit code, company name (e.g. "比亚迪"), or "market" for general news.',
      minLength: 1,
    }),
  ),
  /** Start date YYYYMMDD. */
  start_date: Type.Optional(Type.String({ description: 'Start date (YYYYMMDD).' })),
  /** End date YYYYMMDD. */
  end_date: Type.Optional(Type.String({ description: 'End date (YYYYMMDD).' })),
  /** Max results to return (default: 20). */
  limit: Type.Optional(Type.Integer({ description: 'Number of results to return (default: 20).', minimum: 1 })),
});

export type GetAStockNewsParams = Static<typeof getAStockNewsParams>;

/** Shape returned by `get_astock_news`. */
export interface AStockNewsDetails {
  source?: string;
  type?: string;
  ts_code?: string;
  count?: number;
  data?: unknown;
  reason?: string;
  note?: string;
  error?: string;
  hint?: string;
  suggestion?: string;
  details?: string;
}

/** Migrated strict pi `ToolDefinition` for `get_astock_news`. */
export function createGetAStockNewsTool() {
  return defineTool({
    name: 'get_astock_news',
    label: 'Get AStock News',
    description: `Fetch news and company announcements for A-share (Chinese) stocks.

Input: stock code (Tushare / 6-digit / name), or "market" for general market news.`,
    promptSnippet: 'Get A-share company announcements or general market news',
    promptGuidelines: [
      'Use get_astock_news for company announcements, annual reports, or investor relations news on A-share stocks.',
      'Pass code="market" (without any stock identifier) when the user wants general market news, not stock-specific.',
      'For real-time price moves use get_realtime_quote instead — news is delayed and structured, not a tick.',
    ],
    parameters: getAStockNewsParams,
    async execute(
      _toolCallId,
      params: GetAStockNewsParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: AStockNewsDetails }> {
      const json = (await getAStockNews.func({
        code: params.code,
        start_date: params.start_date,
        end_date: params.end_date,
        limit: params.limit,
      })) as string;

      let details: AStockNewsDetails;
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
// get_sector_data — Industry / concept board
// ============================================================================

/** Sector query type — string enum at the TypeBox level. */
const SectorQueryTypeSchema = Type.Union([
  Type.Literal('stock'),
  Type.Literal('concept'),
  Type.Literal('industry'),
]);

export const getSectorDataParams = Type.Object({
  /** Stock code or concept/industry name. */
  code: Type.Optional(
    Type.String({
      description: 'A-share stock code or concept name (e.g. "新能源汽车", "AI概念").',
      minLength: 1,
    }),
  ),
  /** Query type. */
  type: Type.Optional(SectorQueryTypeSchema),
});

export type GetSectorDataParams = Static<typeof getSectorDataParams>;

/** Shape returned by `get_sector_data`. */
export interface SectorDataDetails {
  source?: string;
  type?: string;
  ts_code?: string;
  count?: number;
  data?: unknown;
  error?: string;
  hint?: string;
}

/** Migrated strict pi `ToolDefinition` for `get_sector_data`. */
export function createGetSectorDataTool() {
  return defineTool({
    name: 'get_sector_data',
    label: 'Get Sector Data',
    description: `Fetch A-share sector/industry and concept board data.

Input: optional stock code (returns its sector) or concept/industry name. When code is omitted, returns the full sector list.`,
    promptSnippet: 'Get A-share sector / industry / concept board data',
    promptGuidelines: [
      'Use get_sector_data to find which industry/sector a stock belongs to, or to list all stocks in a concept ("新能源汽车", "AI概念").',
      'When the user wants a sector list (no specific stock), call with code omitted to get the full industry taxonomy.',
    ],
    parameters: getSectorDataParams,
    async execute(
      _toolCallId,
      params: GetSectorDataParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: SectorDataDetails }> {
      const json = (await getSectorData.func({
        code: params.code,
        type: params.type,
      })) as string;

      let details: SectorDataDetails;
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
// get_technical_data — K-line + MA / MACD / RSI
// ============================================================================

/** K-line period — same enum as get_astock_price. */
const TechnicalPeriodSchema = Type.Union([
  Type.Literal('daily'),
  Type.Literal('weekly'),
  Type.Literal('monthly'),
]);

export const getTechnicalDataParams = Type.Object({
  /** Stock code or company name. */
  code: Type.String({
    description: 'Stock code in Tushare format, 6-digit code, or company name (e.g. "比亚迪", "贵州茅台").',
    minLength: 1,
  }),
  /** Start date YYYYMMDD, e.g. 20240101. */
  start_date: Type.Optional(Type.String({ description: 'Start date (YYYYMMDD, e.g. 20240101).' })),
  /** End date YYYYMMDD. Default: today. */
  end_date: Type.Optional(Type.String({ description: 'End date (YYYYMMDD, default: today).' })),
  /** K-line period. Default `daily`. */
  period: Type.Optional(TechnicalPeriodSchema),
});

export type GetTechnicalDataParams = Static<typeof getTechnicalDataParams>;

/** Shape returned by `get_technical_data`. */
export interface TechnicalDataDetails {
  source?: string;
  ts_code?: string;
  period?: string;
  count?: number;
  data?: unknown;
  error?: string;
}

/** Migrated strict pi `ToolDefinition` for `get_technical_data`. */
export function createGetTechnicalDataTool() {
  return defineTool({
    name: 'get_technical_data',
    label: 'Get Technical Data',
    description: `Fetch technical analysis data (K-line + MA / MACD / RSI) for A-share stocks.

Input: Tushare-format code, 6-digit code, or company name (比亚迪, 贵州茅台).`,
    promptSnippet: 'Get A-share K-line with MA / MACD / RSI indicators',
    promptGuidelines: [
      'Use get_technical_data for technical analysis — K-line plus MA5/10/20, MACD, RSI6/12, volume.',
      "Prefer get_astock_price when only raw OHLCV is needed; get_technical_data adds computed indicators on top.",
    ],
    parameters: getTechnicalDataParams,
    async execute(
      _toolCallId,
      params: GetTechnicalDataParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: TechnicalDataDetails }> {
      const json = (await getTechnicalData.func({
        code: params.code,
        start_date: params.start_date,
        end_date: params.end_date,
        period: params.period,
      })) as string;

      let details: TechnicalDataDetails;
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
// screen_astocks — Sector / exchange screen
// ============================================================================

export const screenAStocksParams = Type.Object({
  /** Industry sector (e.g. "银行", "白酒", "新能源"). */
  sector: Type.Optional(Type.String({ description: 'Industry sector (e.g. "银行", "白酒", "新能源").' })),
  /** Exchange: SH / SZ / BJ. */
  exchange: Type.Optional(
    Type.Union([Type.Literal('SH'), Type.Literal('SZ'), Type.Literal('BJ')]),
  ),
  /** Minimum market cap in 亿元 (not yet implemented in Tushare path). */
  market_cap_min: Type.Optional(Type.Number({ description: 'Minimum market cap in 亿元 (not yet implemented).' })),
  /** Maximum market cap in 亿元 (not yet implemented in Tushare path). */
  market_cap_max: Type.Optional(Type.Number({ description: 'Maximum market cap in 亿元 (not yet implemented).' })),
  /** Minimum PE ratio (not yet implemented in Tushare path). */
  pe_min: Type.Optional(Type.Number({ description: 'Minimum PE ratio (not yet implemented).' })),
  /** Maximum PE ratio (not yet implemented in Tushare path). */
  pe_max: Type.Optional(Type.Number({ description: 'Maximum PE ratio (not yet implemented).' })),
  /** Max results to return (default: 50). */
  limit: Type.Optional(Type.Integer({ description: 'Max results to return (default: 50).', minimum: 1 })),
});

export type ScreenAStocksParams = Static<typeof screenAStocksParams>;

/** Shape returned by `screen_astocks`. */
export interface ScreenAStocksDetails {
  source?: string;
  criteria?: Record<string, unknown>;
  count?: number;
  data?: unknown;
  note?: string;
  error?: string;
  hint?: string;
}

/** Migrated strict pi `ToolDefinition` for `screen_astocks`. */
export function createScreenAStocksTool() {
  return defineTool({
    name: 'screen_astocks',
    label: 'Screen AStocks',
    description: `Screen A-share stocks by sector or exchange.

Input: optional sector name (银行 / 白酒 / 新能源) and/or exchange (SH / SZ / BJ).`,
    promptSnippet: 'Screen A-shares by sector and/or exchange',
    promptGuidelines: [
      'Use screen_astocks to find stocks in a sector or on a specific exchange — supports basic sector + exchange filters.',
      'Market cap and PE filters are accepted in the schema but not yet implemented in the data path; the response includes a `note` field describing the limitation.',
    ],
    parameters: screenAStocksParams,
    async execute(
      _toolCallId,
      params: ScreenAStocksParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: ScreenAStocksDetails }> {
      const json = (await screenAstocks.func({
        sector: params.sector,
        exchange: params.exchange,
        market_cap_min: params.market_cap_min,
        market_cap_max: params.market_cap_max,
        pe_min: params.pe_min,
        pe_max: params.pe_max,
        limit: params.limit,
      })) as string;

      let details: ScreenAStocksDetails;
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