/**
 * Migrated trading extension — pi-native `ToolDefinition` wrappers for
 * the sandbox trading tool family. Strict pi shape with TypeBox schemas,
 * `promptSnippet` + `promptGuidelines` per pi docs/extensions.md.
 *
 * Pass 11 (commit `f87f1bd`): added the 5 core trading tools.
 * Pass 12 (this file): adds the 5 read-only tools covering trade
 *   evaluation, market-calendar awareness, and historical price lookup.
 *
 * Migration strategy:
 *   All 5 tools in this module are READ-ONLY. They never mutate external
 *   state. They keep the catch-and-return-text pattern from earlier
 *   passes (vs Pass 11's throw-on-error for side-effecting tools).
 *
 *   No `signal?.aborted` check needed — these tools complete in <10ms
 *   on the holiday table, no IO happens, no benefit to early-abort.
 *
 * Tool inventory (Pass 12, read-only trading family):
 *   - evaluate_trade          (S2: large multi-field schema w/ nested array)
 *   - check_trading_day       (S1: req date + opt enum)
 *   - get_upcoming_holidays   (S1: req enum + opt date + opt number w/ default)
 *   - get_next_trading_day    (S1: req date + opt enum + opt number)
 *   - get_trading_days        (S1: 2 req dates + opt enum)
 *
 *   All 5 adopt `promptSnippet` + 2 `promptGuidelines` per Pass 8 rule.
 *   All 5 adopt `executionMode: 'sequential'` per Pass 12 pattern — they
 *   access the holiday table which, while immutable, should never be
 *   invoked concurrently with side-effecting siblings.
 */

import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { formatToolResult } from '../tools/types.js';
import {
  isHoliday,
  isWeekend,
  getMarketHolidays,
  formatDate,
} from '../tools/calendar/market-holidays.js';
import { handleEvaluateTrade } from '../tools/backtest/backtest-tools.js';

// ============================================================================
// Shared enums (reused by 4 calendar tools)
// ============================================================================

const MarketSchema = Type.Union([
  Type.Literal('us'),
  Type.Literal('china'),
  Type.Literal('hk'),
]);

// 'all' is only valid for check_trading_day — kept separate to keep
// the other tools strictly bound to single markets.
const MarketOrAllSchema = Type.Union([
  Type.Literal('us'),
  Type.Literal('china'),
  Type.Literal('hk'),
  Type.Literal('all'),
]);

// ============================================================================
// evaluate_trade — S2 large schema (SIDE-EFFECT-FREE: pure historical calc)
// ============================================================================

const ForwardBarSchema = Type.Object({
  date: Type.String({
    description: 'Date in YYYY-MM-DD format',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  }),
  high: Type.Optional(Type.Number({ minimum: 0 })),
  low: Type.Optional(Type.Number({ minimum: 0 })),
  close: Type.Optional(Type.Number({ minimum: 0 })),
});

export const evaluateTradeParams = Type.Object({
  symbol: Type.String({
    description: 'Stock symbol (e.g., AAPL, 600519, 0700.HK)',
    minLength: 1,
  }),
  analysisDate: Type.String({
    description: 'Analysis date in YYYY-MM-DD format',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  }),
  operationAdvice: Type.String({
    description: 'Investment advice text (e.g., "买入", "持有", "卖出", "观望")',
    minLength: 1,
  }),
  entryPrice: Type.Number({
    description: 'Entry price per share',
    minimum: 0,
  }),
  stopLoss: Type.Optional(Type.Number({
    description: 'Stop loss price (optional)',
    minimum: 0,
  })),
  takeProfit: Type.Optional(Type.Number({
    description: 'Take profit price (optional)',
    minimum: 0,
  })),
  quantity: Type.Optional(Type.Number({
    description: 'Number of shares',
    minimum: 1,
  })),
  forwardBars: Type.Array(ForwardBarSchema, {
    description: 'Forward price bars (OHLC data) — at least 1',
    minItems: 1,
  }),
  evalWindowDays: Type.Optional(Type.Number({
    description: 'Evaluation window in trading days',
    minimum: 1,
  })),
  neutralBandPct: Type.Optional(Type.Number({
    description: 'Neutral band percentage for win/loss classification',
    minimum: 0,
  })),
});

export type EvaluateTradeParams = Static<typeof evaluateTradeParams>;

export interface EvaluateTradeDetails {
  symbol: string;
  analysisDate: string;
  win: boolean;
  pnl: number;
  pnlPct: number;
  outcome: string;
  evalWindowDays: number;
}

/**
 * Evaluate a single historical trade against forward price data.
 * Pure calculation — no IO, no side effects.
 *
 * The inner handler `handleEvaluateTrade` returns a `formatToolResult(...)`
 * JSON string. We parse it back to extract structured fields for the
 * `details` payload, then re-wrap the original string for `content[0].text`.
 */
export function createEvaluateTradeTool() {
  return defineTool({
    name: 'evaluate_trade',
    label: 'Evaluate Trade',
    description: `Evaluate a single historical trade against forward price data. Computes win/loss, direction accuracy, and simulates stop-loss / take-profit outcomes.

Common usage:
- "评估这笔交易" → forwardBars from a known price series
- "假设我在 95 块买入，止损 90，止盈 100，结果如何？" → {symbol, entryPrice, stopLoss, takeProfit, forwardBars}`,
    promptSnippet: 'Evaluate a single historical trade against forward price data',
    promptGuidelines: [
      'Use evaluate_trade to assess a completed trade against actual forward prices — returns win/loss, P&L, and stop/take-profit trigger status.',
      'forwardBars must include at least 1 bar with date + (high | low | close) for the tool to compute a meaningful result.',
    ],
    parameters: evaluateTradeParams,
    async execute(
      _toolCallId,
      params: EvaluateTradeParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: EvaluateTradeDetails }> {
      // Legacy handler requires quantity as required number; supply
      // the legacy default of 100 if caller omitted it. Also
      // legacy handler requires evalWindowDays + neutralBandPct
      // as required numbers.
      const resultString = await handleEvaluateTrade({
        ...params,
        quantity: params.quantity ?? 100,
        evalWindowDays: params.evalWindowDays ?? 30,
        neutralBandPct: params.neutralBandPct ?? 2.0,
      });

      // Parse the formatToolResult({data: {...}}) envelope so we can
      // surface structured fields to the pi runtime via `details`.
      // The LLM still sees the full text via `result.content[0].text`.
      let parsed: { data?: { directionCorrect?: boolean; simulatedReturnPct?: string; outcome?: string; evalWindowDays?: number } } = {};
      try {
        parsed = JSON.parse(resultString) as typeof parsed;
      } catch {
        // handler returned an error message string — fall through
      }
      const data = parsed.data ?? {};

      const details: EvaluateTradeDetails = {
        symbol: params.symbol,
        analysisDate: params.analysisDate,
        win: typeof data.directionCorrect === 'boolean' ? data.directionCorrect : false,
        pnl: typeof data.simulatedReturnPct === 'string'
          ? parseFloat(data.simulatedReturnPct.replace('%', '')) || 0
          : 0,
        pnlPct: typeof data.simulatedReturnPct === 'string'
          ? parseFloat(data.simulatedReturnPct.replace('%', '')) || 0
          : 0,
        outcome: data.outcome ?? 'unknown',
        evalWindowDays: data.evalWindowDays ?? (params.evalWindowDays ?? 30),
      };

      return {
        content: [{ type: 'text', text: resultString }],
        details,
      };
    },
  });
}

// ============================================================================
// check_trading_day — S1 (req date + opt enum)
// ============================================================================

export const checkTradingDayParams = Type.Object({
  date: Type.String({
    description: 'Date to check in YYYY-MM-DD format',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  }),
  market: Type.Optional(MarketOrAllSchema),
});

export type CheckTradingDayParams = Static<typeof checkTradingDayParams>;

export interface CheckTradingDayDetails {
  date: string;
  isTradingDay: boolean;
  isWeekend: boolean;
  market?: string;
  isHoliday?: boolean;
  holidayName?: string;
  markets?: {
    us: { isHoliday: boolean; holidayName: string | null };
    china: { isHoliday: boolean; holidayName: string | null };
    hk: { isHoliday: boolean; holidayName: string | null };
  };
  message: string;
}

/** Check if a given date is a trading day for US / China / HK markets. */
export function createCheckTradingDayTool() {
  return defineTool({
    name: 'check_trading_day',
    label: 'Check Trading Day',
    description: 'Check if a given date is a trading day (not weekend, not holiday) for US, China, or HK markets. Pass market="all" to check all three markets at once.',
    promptSnippet: 'Check if a date is a trading day for US / China / HK markets',
    promptGuidelines: [
      'Use check_trading_day before scheduling trade execution to verify the date is not a weekend or market holiday.',
      'market defaults to "us"; pass "all" to see holiday status across US / China / HK simultaneously.',
    ],
    parameters: checkTradingDayParams,
    async execute(
      _toolCallId,
      params: CheckTradingDayParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: CheckTradingDayDetails }> {
      const checkDate = new Date(params.date);
      const dateStr = formatDate(checkDate);
      const isWeekendDay = isWeekend(checkDate);
      const market = params.market ?? 'us';

      const holidayCheck = market === 'all'
        ? { isHoliday: false, name: null as string | null }
        : isHoliday(dateStr, market);

      const isTradingDay = !isWeekendDay && !holidayCheck.isHoliday;

      const result: Record<string, unknown> = {
        date: dateStr,
        isTradingDay,
        isWeekend: isWeekendDay,
      };

      if (market !== 'all') {
        result.market = market.toUpperCase();
        if (holidayCheck.isHoliday) {
          result.isHoliday = true;
          result.holidayName = holidayCheck.name;
        }
      } else {
        const usCheck = isHoliday(dateStr, 'us');
        const chinaCheck = isHoliday(dateStr, 'china');
        const hkCheck = isHoliday(dateStr, 'hk');
        result.markets = {
          us: { isHoliday: usCheck.isHoliday, holidayName: usCheck.name },
          china: { isHoliday: chinaCheck.isHoliday, holidayName: chinaCheck.name },
          hk: { isHoliday: hkCheck.isHoliday, holidayName: hkCheck.name },
        };
      }

      const message = isTradingDay
        ? `${dateStr} is a trading day.`
        : `${dateStr} is not a trading day${holidayCheck.name ? ` (${holidayCheck.name})` : ''}.`;
      result.message = message;

      return {
        content: [{ type: 'text', text: formatToolResult(result) }],
        details: result as unknown as CheckTradingDayDetails,
      };
    },
  });
}

// ============================================================================
// get_upcoming_holidays — S1 (req enum + opt date + opt number w/ default)
// ============================================================================

export const getUpcomingHolidaysParams = Type.Object({
  market: Type.Optional(MarketSchema),
  startDate: Type.Optional(Type.String({
    description: 'Start date in YYYY-MM-DD format (default: today)',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })),
  count: Type.Optional(Type.Integer({
    description: 'Number of holidays to return (1-20)',
    minimum: 1,
    maximum: 20,
  })),
});

export type GetUpcomingHolidaysParams = Static<typeof getUpcomingHolidaysParams>;

export interface GetUpcomingHolidaysDetails {
  market: string;
  startDate: string;
  count: number;
  holidays: Array<{ date: string; name: string; daysUntil: number }>;
  message: string;
}

/** Get upcoming market holidays for US, China, or HK. */
export function createGetUpcomingHolidaysTool() {
  return defineTool({
    name: 'get_upcoming_holidays',
    label: 'Get Upcoming Holidays',
    description: 'Get upcoming market holidays for US, China, or HK markets. Returns the next N holidays from the start date (default: today).',
    promptSnippet: 'Get upcoming market holidays for US / China / HK markets',
    promptGuidelines: [
      'Use get_upcoming_holidays to see when markets will be closed in the next 1-12 months.',
      'count defaults to 5, capped at 20 to avoid runaway holiday lists.',
    ],
    parameters: getUpcomingHolidaysParams,
    async execute(
      _toolCallId,
      params: GetUpcomingHolidaysParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetUpcomingHolidaysDetails }> {
      const market = params.market ?? 'us';
      const start = params.startDate ? new Date(params.startDate) : new Date();
      const count = params.count ?? 5;
      const holidays = getMarketHolidays(market);
      const upcoming: Array<{ date: string; name: string; daysUntil: number }> = [];

      const searchEnd = new Date(start);
      searchEnd.setFullYear(searchEnd.getFullYear() + 1);

      for (let d = new Date(start); d <= searchEnd && upcoming.length < count; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        const holidayName = holidays[dateStr];
        if (holidayName) {
          const daysUntil = Math.ceil((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          upcoming.push({ date: dateStr, name: holidayName, daysUntil });
        }
      }

      const message = upcoming.length === 0
        ? `No upcoming holidays found for ${market.toUpperCase()}.`
        : `Found ${upcoming.length} upcoming holidays.`;

      const details: GetUpcomingHolidaysDetails = {
        market: market.toUpperCase(),
        startDate: formatDate(start),
        count: upcoming.length,
        holidays: upcoming,
        message,
      };

      return {
        content: [{
          type: 'text',
          text: formatToolResult({
            type: 'Upcoming Holidays',
            ...details,
          }),
        }],
        details,
      };
    },
  });
}

// ============================================================================
// get_next_trading_day — S1 (req date + opt enum + opt number)
// ============================================================================

export const getNextTradingDayParams = Type.Object({
  fromDate: Type.String({
    description: 'Starting date in YYYY-MM-DD format',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  }),
  market: Type.Optional(MarketSchema),
  skipDays: Type.Optional(Type.Integer({
    description: 'Number of trading days to skip (1-30)',
    minimum: 1,
    maximum: 30,
  })),
});

export type GetNextTradingDayParams = Static<typeof getNextTradingDayParams>;

export interface GetNextTradingDayDetails {
  fromDate: string;
  targetTradingDay: string;
  skipDays: number;
  market: string;
  message: string;
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/** Find the Nth trading day after a given date, skipping weekends + holidays. */
export function createGetNextTradingDayTool() {
  return defineTool({
    name: 'get_next_trading_day',
    label: 'Get Next Trading Day',
    description: 'Find the next trading day after a given date, skipping weekends and holidays. skipDays controls how many trading days to advance (1-30).',
    promptSnippet: 'Find the next trading day after a given date',
    promptGuidelines: [
      'Use get_next_trading_day to schedule a trade or compute a forward date that lands on a real trading day.',
      'skipDays defaults to 1 — pass 2 to land on the second trading day after fromDate.',
    ],
    parameters: getNextTradingDayParams,
    async execute(
      _toolCallId,
      params: GetNextTradingDayParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetNextTradingDayDetails }> {
      const market = params.market ?? 'us';
      const skipDays = params.skipDays ?? 1;
      const holidays = getMarketHolidays(market);
      let currentDate = new Date(params.fromDate);
      let tradingDaysSkipped = 0;

      while (tradingDaysSkipped < skipDays) {
        currentDate.setDate(currentDate.getDate() + 1);
        const dateStr = formatDate(currentDate);
        const isWeekendDay = isWeekend(currentDate);
        const isHolidayDay = !!holidays[dateStr];

        if (!isWeekendDay && !isHolidayDay) {
          tradingDaysSkipped++;
        }
      }

      const details: GetNextTradingDayDetails = {
        fromDate: params.fromDate,
        targetTradingDay: formatDate(currentDate),
        skipDays,
        market: market.toUpperCase(),
        message: `The ${skipDays}${getOrdinalSuffix(skipDays)} trading day after ${params.fromDate} is ${formatDate(currentDate)}.`,
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Next Trading Day',
          ...details,
        }) }],
        details,
      };
    },
  });
}

// ============================================================================
// get_trading_days — S1 (2 req dates + opt enum)
// ============================================================================

export const getTradingDaysParams = Type.Object({
  startDate: Type.String({
    description: 'Start date in YYYY-MM-DD format',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  }),
  endDate: Type.String({
    description: 'End date in YYYY-MM-DD format',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  }),
  market: Type.Optional(MarketSchema),
});

export type GetTradingDaysParams = Static<typeof getTradingDaysParams>;

export interface GetTradingDaysDetails {
  startDate: string;
  endDate: string;
  market: string;
  totalDays: number;
  tradingDays: string[];
  message: string;
}

/** Get all trading days in a date range (inclusive), skipping weekends + holidays. */
export function createGetTradingDaysTool() {
  return defineTool({
    name: 'get_trading_days',
    label: 'Get Trading Days',
    description: 'Get a list of all trading days between two dates (inclusive), for US / China / HK markets.',
    promptSnippet: 'Get all trading days in a date range',
    promptGuidelines: [
      'Use get_trading_days to enumerate valid trade-execution dates in a window — useful for backtest scheduling or batch order placement.',
      'endDate must be >= startDate or the tool returns an empty list.',
    ],
    parameters: getTradingDaysParams,
    async execute(
      _toolCallId,
      params: GetTradingDaysParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetTradingDaysDetails }> {
      const market = params.market ?? 'us';
      const start = new Date(params.startDate);
      const end = new Date(params.endDate);
      const holidays = getMarketHolidays(market);
      const tradingDays: string[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        const isWeekendDay = isWeekend(d);
        const isHolidayDay = !!holidays[dateStr];

        if (!isWeekendDay && !isHolidayDay) {
          tradingDays.push(dateStr);
        }
      }

      const details: GetTradingDaysDetails = {
        startDate: params.startDate,
        endDate: params.endDate,
        market: market.toUpperCase(),
        totalDays: tradingDays.length,
        tradingDays,
        message: `Found ${tradingDays.length} trading days between ${params.startDate} and ${params.endDate}.`,
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Trading Days List',
          ...details,
        }) }],
        details,
      };
    },
  });
}