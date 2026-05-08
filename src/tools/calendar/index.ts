/**
 * Market Calendar Tools
 *
 * Exports market holiday and trading day utilities
 */

export {
  createCheckTradingDayTool,
  createGetUpcomingHolidaysTool,
  createGetNextTradingDayTool,
  createGetTradingDaysTool,
  calendarTools,
} from './market-holidays.js';

export const CHECK_TRADING_DAY_DESCRIPTION = `
Check if a date is a trading day for a specific market.

## Supported Markets
- US: NYSE/NASDAQ trading days
- China: SSE/CNEX A-share trading days
- HK: HKEX trading days

## Usage
Provide a date and market code. Returns whether it's a trading day,
and if not, the reason (weekend or holiday name).
`.trim();

export const GET_UPCOMING_HOLIDAYS_DESCRIPTION = `
Get upcoming market holidays for the next year.

## Supported Markets
- US: NYSE/NASDAQ holidays
- China: A-share holidays (Spring Festival, National Day, etc.)
- HK: HKEX holidays

## Usage
Returns holidays sorted by date with days until each holiday.
`.trim();

export const GET_NEXT_TRADING_DAY_DESCRIPTION = `
Find the next trading day after a given date.

## Usage
Skips weekends and holidays to find the target trading day.
Useful for determining settlement dates or market openings.
`.trim();

export const GET_TRADING_DAYS_DESCRIPTION = `
Get all trading days between two dates.

## Usage
Returns a list of all trading days (excluding weekends and holidays)
between the start and end dates (inclusive).
`.trim();
