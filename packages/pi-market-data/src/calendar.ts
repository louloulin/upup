export type CalendarMarket = 'us' | 'china' | 'hk';

const HOLIDAYS: Record<CalendarMarket, Readonly<Record<string, string>>> = {
  us: {
    '2026-01-01': "New Year's Day", '2026-01-19': "Martin Luther King Jr. Day", '2026-02-16': "Presidents' Day",
    '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth',
    '2026-07-03': 'Independence Day (observed)', '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving Day', '2026-12-25': 'Christmas Day',
  },
  china: {
    '2026-01-01': "New Year's Day", '2026-01-26': 'Spring Festival', '2026-01-27': 'Spring Festival', '2026-01-28': 'Spring Festival',
    '2026-01-29': 'Spring Festival', '2026-01-30': 'Spring Festival', '2026-01-31': 'Spring Festival', '2026-02-01': 'Spring Festival',
    '2026-02-02': 'Spring Festival', '2026-02-03': 'Spring Festival', '2026-04-04': 'Qingming Festival', '2026-04-05': 'Qingming Festival',
    '2026-04-06': 'Qingming Festival', '2026-05-01': 'Labor Day', '2026-05-02': 'Labor Day', '2026-05-03': 'Labor Day',
    '2026-05-04': 'Labor Day', '2026-05-05': 'Labor Day', '2026-06-01': "Children's Day", '2026-06-02': "Children's Day",
    '2026-10-01': 'National Day', '2026-10-02': 'National Day', '2026-10-03': 'National Day', '2026-10-04': 'National Day',
    '2026-10-05': 'National Day', '2026-10-06': 'National Day', '2026-10-07': 'National Day', '2026-10-08': 'National Day',
  },
  hk: {
    '2026-01-01': "New Year's Day", '2026-02-16': 'Chinese New Year', '2026-02-17': 'Chinese New Year', '2026-02-18': 'Chinese New Year',
    '2026-02-19': 'Chinese New Year', '2026-02-20': 'Chinese New Year', '2026-04-03': 'Good Friday', '2026-04-05': 'Qingming Festival',
    '2026-04-06': 'Easter Monday', '2026-05-01': 'Labor Day', '2026-05-26': "Buddha's Birthday", '2026-06-19': 'Dragon Boat Festival',
    '2026-07-01': 'Hong Kong SAR Establishment Day', '2026-09-25': 'Day after Mid-Autumn Festival', '2026-10-01': 'National Day',
    '2026-10-18': 'Chung Yeung Festival', '2026-12-25': 'Christmas Day', '2026-12-26': 'Boxing Day',
  },
};

function parseDate(value: string): Date | undefined {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }
function isWeekend(date: Date): boolean { return date.getUTCDay() === 0 || date.getUTCDay() === 6; }
function holidayName(date: Date, market: CalendarMarket): string | undefined { return HOLIDAYS[market][dateKey(date)]; }

export function isCalendarTradingDay(value: string, market: CalendarMarket): boolean {
  const date = parseDate(value);
  return Boolean(date && !isWeekend(date) && !holidayName(date, market));
}

export function upcomingCalendarHolidays(value: string | undefined, market: CalendarMarket, count: number) {
  const start = value ? parseDate(value) : new Date('2026-01-01T00:00:00Z');
  if (!start) return undefined;
  const results: { date: string; name: string; daysUntil: number }[] = [];
  const cursor = new Date(start);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  for (; cursor <= end && results.length < count; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const name = holidayName(cursor, market);
    if (name) results.push({ date: dateKey(cursor), name, daysUntil: Math.round((cursor.getTime() - start.getTime()) / 86400000) });
  }
  return results;
}

export function nextCalendarTradingDay(value: string, market: CalendarMarket, skipDays: number): string | undefined {
  const start = parseDate(value);
  if (!start) return undefined;
  const cursor = new Date(start);
  let skipped = 0;
  while (skipped < skipDays) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isCalendarTradingDay(dateKey(cursor), market)) skipped++;
  }
  return dateKey(cursor);
}

export function calendarTradingDays(startValue: string, endValue: string, market: CalendarMarket): string[] | undefined {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end || end < start) return undefined;
  const days: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (isCalendarTradingDay(dateKey(cursor), market)) days.push(dateKey(cursor));
  }
  return days;
}
