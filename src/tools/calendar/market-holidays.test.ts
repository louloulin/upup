/**
 * Market Calendar Tests
 */

import { describe, it, expect } from 'vitest';
import {
  createCheckTradingDayTool,
  createGetUpcomingHolidaysTool,
  createGetNextTradingDayTool,
  createGetTradingDaysTool,
} from './market-holidays.js';

describe('check_trading_day', () => {
  const tool = createCheckTradingDayTool();

  it('identifies trading days correctly', async () => {
    // 2025-05-08 is a Thursday - should be a trading day for US
    const result = await tool.invoke({
      date: '2025-05-08',
      market: 'us',
    });
    expect(result).toBeDefined();
    expect(result).toContain('2025-05-08');
  });

  it('identifies weekends correctly', async () => {
    // 2025-05-10 is a Saturday
    const result = await tool.invoke({
      date: '2025-05-10',
      market: 'us',
    });
    expect(result).toContain('isWeekend');
  });

  it('identifies US holidays correctly', async () => {
    // 2025-12-25 is Christmas
    const result = await tool.invoke({
      date: '2025-12-25',
      market: 'us',
    });
    expect(result).toContain('Christmas');
  });

  it('identifies China holidays correctly', async () => {
    // 2025-10-01 is National Day
    const result = await tool.invoke({
      date: '2025-10-01',
      market: 'china',
    });
    expect(result).toContain('National Day');
  });

  it('handles all markets', async () => {
    const result = await tool.invoke({
      date: '2025-01-01',
      market: 'all',
    });
    expect(result).toContain('us');
    expect(result).toContain('china');
    expect(result).toContain('hk');
  });

  it('handles invalid date gracefully', async () => {
    const result = await tool.invoke({
      date: 'invalid-date',
      market: 'us',
    });
    expect(result).toContain('Invalid');
  });
});

describe('get_upcoming_holidays', () => {
  const tool = createGetUpcomingHolidaysTool();

  it('returns US holidays', async () => {
    const result = await tool.invoke({
      market: 'us',
      startDate: '2025-06-01',
      count: 3,
    });
    expect(result).toContain('US');
    expect(result).toContain('holidays');
  });

  it('returns China holidays', async () => {
    const result = await tool.invoke({
      market: 'china',
      startDate: '2025-09-01',
      count: 5,
    });
    expect(result).toContain('CHINA');
    expect(result).toContain('National Day');
  });

  it('handles default start date', async () => {
    const result = await tool.invoke({
      market: 'hk',
      count: 3,
    });
    expect(result).toContain('HK');
    expect(result).toContain('holidays');
  });
});

describe('get_next_trading_day', () => {
  const tool = createGetNextTradingDayTool();

  it('skips weekend', async () => {
    // Start from Friday, should get Monday
    const result = await tool.invoke({
      fromDate: '2025-05-09', // Friday
      market: 'us',
      skipDays: 1,
    });
    expect(result).toContain('2025-05-12'); // Monday
  });

  it('skips holiday', async () => {
    // Start from day before Christmas
    const result = await tool.invoke({
      fromDate: '2025-12-24',
      market: 'us',
      skipDays: 1,
    });
    expect(result).toContain('2025-12-26'); // Skip Christmas
  });

  it('skips multiple days', async () => {
    const result = await tool.invoke({
      fromDate: '2025-05-08',
      market: 'us',
      skipDays: 5,
    });
    expect(result).toContain('skipDays');
  });
});

describe('get_trading_days', () => {
  const tool = createGetTradingDaysTool();

  it('returns trading days in range', async () => {
    const result = await tool.invoke({
      startDate: '2025-05-05',
      endDate: '2025-05-09',
      market: 'us',
    });
    expect(result).toContain('tradingDays');
    expect(result).toContain('totalDays');
  });

  it('excludes weekends', async () => {
    const result = await tool.invoke({
      startDate: '2025-05-09', // Friday
      endDate: '2025-05-13', // Tuesday (includes weekend)
      market: 'us',
    });
    expect(result).toContain('2025-05-09');
    expect(result).toContain('2025-05-12');
    expect(result).not.toContain('2025-05-10'); // Saturday
    expect(result).not.toContain('2025-05-11'); // Sunday
  });

  it('excludes holidays', async () => {
    const result = await tool.invoke({
      startDate: '2025-12-23',
      endDate: '2025-12-29',
      market: 'us',
    });
    expect(result).toContain('2025-12-23');
    expect(result).not.toContain('2025-12-25'); // Christmas
  });

  it('handles invalid date range', async () => {
    const result = await tool.invoke({
      startDate: '2025-12-31',
      endDate: '2025-12-01', // End before start
      market: 'us',
    });
    expect(result).toContain('after start');
  });
});