/**
 * Market Holiday Calendar Tool
 *
 * Provides trading day/holiday detection for US, China, and HK markets.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface Holiday {
  date: string;
  name: string;
  market: string;
}

// ============================================================================
// US Market Holidays (NYSE/NASDAQ)
// ============================================================================

const US_HOLIDAYS: Record<string, string> = {
  '2025-01-01': "New Year's Day",
  '2025-01-20': "Martin Luther King Jr. Day",
  '2025-02-17': "Presidents' Day",
  '2025-04-18': "Good Friday",
  '2025-05-26': "Memorial Day",
  '2025-06-19': "Juneteenth",
  '2025-07-04': "Independence Day",
  '2025-09-01': "Labor Day",
  '2025-11-27': "Thanksgiving Day",
  '2025-12-25': "Christmas Day",
  // 2026
  '2026-01-01': "New Year's Day",
  '2026-01-19': "Martin Luther King Jr. Day",
  '2026-02-16': "Presidents' Day",
  '2026-04-03': "Good Friday",
  '2026-05-25': "Memorial Day",
  '2026-06-19': "Juneteenth",
  '2026-07-03': "Independence Day (observed)",
  '2026-09-07': "Labor Day",
  '2026-11-26': "Thanksgiving Day",
  '2026-12-25': "Christmas Day",
};

// ============================================================================
// China A-Share Holidays (Simplified - Major holidays)
// ============================================================================

const CHINA_HOLIDAYS: Record<string, string> = {
  '2025-01-01': "New Year's Day",
  '2025-01-28': "Spring Festival",
  '2025-01-29': "Spring Festival",
  '2025-01-30': "Spring Festival",
  '2025-01-31': "Spring Festival",
  '2025-02-01': "Spring Festival",
  '2025-02-02': "Spring Festival",
  '2025-02-03': "Spring Festival",
  '2025-02-04': "Spring Festival",
  '2025-04-04': "Qingming Festival",
  '2025-04-05': "Qingming Festival",
  '2025-05-01': "Labor Day",
  '2025-05-02': "Labor Day",
  '2025-05-03': "Labor Day",
  '2025-05-04': "Labor Day",
  '2025-05-05': "Labor Day",
  '2025-06-01': "Children's Day",
  '2025-06-02': "Children's Day",
  '2025-10-01': "National Day",
  '2025-10-02': "National Day",
  '2025-10-03': "National Day",
  '2025-10-04': "National Day",
  '2025-10-05': "National Day",
  '2025-10-06': "National Day",
  '2025-10-07': "National Day",
  '2025-10-08': "National Day",
  // 2026
  '2026-01-01': "New Year's Day",
  '2026-01-26': "Spring Festival",
  '2026-01-27': "Spring Festival",
  '2026-01-28': "Spring Festival",
  '2026-01-29': "Spring Festival",
  '2026-01-30': "Spring Festival",
  '2026-01-31': "Spring Festival",
  '2026-02-01': "Spring Festival",
  '2026-02-02': "Spring Festival",
  '2026-02-03': "Spring Festival",
  '2026-04-04': "Qingming Festival",
  '2026-04-05': "Qingming Festival",
  '2026-04-06': "Qingming Festival",
  '2026-05-01': "Labor Day",
  '2026-05-02': "Labor Day",
  '2026-05-03': "Labor Day",
  '2026-05-04': "Labor Day",
  '2026-05-05': "Labor Day",
  '2026-06-01': "Children's Day",
  '2026-06-02': "Children's Day",
  '2026-10-01': "National Day",
  '2026-10-02': "National Day",
  '2026-10-03': "National Day",
  '2026-10-04': "National Day",
  '2026-10-05': "National Day",
  '2026-10-06': "National Day",
  '2026-10-07': "National Day",
  '2026-10-08': "National Day",
};

// ============================================================================
// HK Market Holidays (Hong Kong Stock Exchange)
// ============================================================================

const HK_HOLIDAYS: Record<string, string> = {
  '2025-01-01': "New Year's Day",
  '2025-01-29': "Chinese New Year",
  '2025-01-30': "Chinese New Year",
  '2025-01-31': "Chinese New Year",
  '2025-02-01': "Chinese New Year",
  '2025-02-02': "Chinese New Year",
  '2025-02-03': "Chinese New Year",
  '2025-04-04': "Qingming Festival",
  '2025-04-18': "Good Friday",
  '2025-04-20': "Easter Monday",
  '2025-05-01': "Labor Day",
  '2025-05-05': "Buddha's Birthday",
  '2025-05-31': "Dragon Boat Festival",
  '2025-07-01': "Hong Kong SAR Establishment Day",
  '2025-09-07': "Day after Mid-Autumn Festival",
  '2025-10-01': "National Day",
  '2025-10-07': "Day after Chung Yeung Festival",
  '2025-12-25': "Christmas Day",
  '2025-12-26': "Boxing Day",
  // 2026
  '2026-01-01': "New Year's Day",
  '2026-02-16': "Chinese New Year",
  '2026-02-17': "Chinese New Year",
  '2026-02-18': "Chinese New Year",
  '2026-02-19': "Chinese New Year",
  '2026-02-20': "Chinese New Year",
  '2026-02-21': "Chinese New Year",
  '2026-02-22': "Chinese New Year",
  '2026-04-03': "Good Friday",
  '2026-04-06': "Easter Monday",
  '2026-04-05': "Qingming Festival",
  '2026-05-01': "Labor Day",
  '2026-05-26': "Buddha's Birthday",
  '2026-06-19': "Dragon Boat Festival",
  '2026-07-01': "Hong Kong SAR Establishment Day",
  '2026-09-25': "Day after Mid-Autumn Festival",
  '2026-10-01': "National Day",
  '2026-10-18': "Chung Yeung Festival",
  '2026-12-25': "Christmas Day",
  '2026-12-26': "Boxing Day",
};

// ============================================================================
// Helper Functions
// ============================================================================

function getMarketHolidays(market: string): Record<string, string> {
  switch (market.toLowerCase()) {
    case 'us':
    case 'usa':
    case 'nyse':
    case 'nasdaq':
      return US_HOLIDAYS;
    case 'china':
    case 'a-share':
    case 'sse':
    case 'cnex':
      return CHINA_HOLIDAYS;
    case 'hk':
    case 'hkex':
    case 'hongkong':
      return HK_HOLIDAYS;
    default:
      return { ...US_HOLIDAYS, ...CHINA_HOLIDAYS, ...HK_HOLIDAYS };
  }
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isHoliday(dateStr: string, market: string): { isHoliday: boolean; name: string | null } {
  const holidays = getMarketHolidays(market);
  const name = holidays[dateStr] || null;
  return { isHoliday: !!name, name };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const checkTradingDaySchema = z.object({
  date: z.string().describe('Date to check in YYYY-MM-DD format'),
  market: z.enum(['us', 'china', 'hk', 'all']).default('us').describe('Market to check'),
});

const getUpcomingHolidaysSchema = z.object({
  market: z.enum(['us', 'china', 'hk']).default('us').describe('Market to check'),
  startDate: z.string().optional().describe('Start date in YYYY-MM-DD format (default: today)'),
  count: z.number().int().min(1).max(20).default(5).describe('Number of holidays to return'),
});

const getNextTradingDaySchema = z.object({
  fromDate: z.string().describe('Starting date in YYYY-MM-DD format'),
  market: z.enum(['us', 'china', 'hk']).default('us').describe('Market to check'),
  skipDays: z.number().int().min(1).max(30).default(1).describe('Number of trading days to skip'),
});

const getTradingDaysSchema = z.object({
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format'),
  market: z.enum(['us', 'china', 'hk']).default('us').describe('Market to check'),
});

// ============================================================================
// Tool Factories
// ============================================================================

export function createCheckTradingDayTool() {
  return new DynamicStructuredTool({
    name: 'check_trading_day',
    description: 'Check if a given date is a trading day (not weekend, not holiday) for US, China, or HK markets.',
    schema: checkTradingDaySchema,
    func: async ({ date, market }) => {
      const checkDate = new Date(date);
      if (isNaN(checkDate.getTime())) {
        return formatToolResult({
          type: 'Trading Day Check Error',
          message: 'Invalid date format. Use YYYY-MM-DD.',
          date,
        });
      }

      const dateStr = formatDate(checkDate);
      const isWeekendDay = isWeekend(checkDate);
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
        // Check all markets
        const usCheck = isHoliday(dateStr, 'us');
        const chinaCheck = isHoliday(dateStr, 'china');
        const hkCheck = isHoliday(dateStr, 'hk');
        
        result.markets = {
          us: { isHoliday: usCheck.isHoliday, holidayName: usCheck.name },
          china: { isHoliday: chinaCheck.isHoliday, holidayName: chinaCheck.name },
          hk: { isHoliday: hkCheck.isHoliday, holidayName: hkCheck.name },
        };
      }

      return formatToolResult({
        ...result,
        message: isTradingDay 
          ? `${dateStr} is a trading day.`
          : `${dateStr} is not a trading day${holidayCheck.name ? ` (${holidayCheck.name})` : ''}.`,
      });
    },
  });
}

export function createGetUpcomingHolidaysTool() {
  return new DynamicStructuredTool({
    name: 'get_upcoming_holidays',
    description: 'Get upcoming market holidays for US, China, or HK markets.',
    schema: getUpcomingHolidaysSchema,
    func: async ({ market, startDate, count }) => {
      const start = startDate ? new Date(startDate) : new Date();
      if (isNaN(start.getTime())) {
        return formatToolResult({
          type: 'Holiday List Error',
          message: 'Invalid start date format. Use YYYY-MM-DD.',
        });
      }

      const holidays = getMarketHolidays(market);
      const upcoming: { date: string; name: string; daysUntil: number }[] = [];
      
      // Search for holidays from start date for next 365 days
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

      return formatToolResult({
        type: 'Upcoming Holidays',
        market: market.toUpperCase(),
        startDate: formatDate(start),
        count: upcoming.length,
        holidays: upcoming,
        message: upcoming.length === 0 
          ? `No upcoming holidays found for ${market.toUpperCase()}.`
          : `Found ${upcoming.length} upcoming holidays.`,
      });
    },
  });
}

export function createGetNextTradingDayTool() {
  return new DynamicStructuredTool({
    name: 'get_next_trading_day',
    description: 'Find the next trading day after a given date, skipping weekends and holidays.',
    schema: getNextTradingDaySchema,
    func: async ({ fromDate, market, skipDays }) => {
      const start = new Date(fromDate);
      if (isNaN(start.getTime())) {
        return formatToolResult({
          type: 'Next Trading Day Error',
          message: 'Invalid date format. Use YYYY-MM-DD.',
        });
      }

      const holidays = getMarketHolidays(market);
      let currentDate = new Date(start);
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

      return formatToolResult({
        type: 'Next Trading Day',
        fromDate,
        targetTradingDay: formatDate(currentDate),
        skipDays,
        market: market.toUpperCase(),
        message: `The ${skipDays}${getOrdinalSuffix(skipDays)} trading day after ${fromDate} is ${formatDate(currentDate)}.`,
      });
    },
  });
}

export function createGetTradingDaysTool() {
  return new DynamicStructuredTool({
    name: 'get_trading_days',
    description: 'Get a list of all trading days between two dates (inclusive).',
    schema: getTradingDaysSchema,
    func: async ({ startDate, endDate, market }) => {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return formatToolResult({
          type: 'Trading Days Error',
          message: 'Invalid date format. Use YYYY-MM-DD.',
        });
      }

      if (end < start) {
        return formatToolResult({
          type: 'Trading Days Error',
          message: 'End date must be after start date.',
        });
      }

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

      return formatToolResult({
        type: 'Trading Days List',
        startDate,
        endDate,
        market: market.toUpperCase(),
        totalDays: tradingDays.length,
        tradingDays,
        message: `Found ${tradingDays.length} trading days between ${startDate} and ${endDate}.`,
      });
    },
  });
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export const calendarTools = [
  createCheckTradingDayTool(),
  createGetUpcomingHolidaysTool(),
  createGetNextTradingDayTool(),
  createGetTradingDaysTool(),
];
