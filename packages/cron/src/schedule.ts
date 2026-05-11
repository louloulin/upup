/**
 * UpUp Cron System — Schedule Computation
 *
 * Computes next run times for different schedule types.
 */

import { Cron } from 'croner';
import type { CronSchedule } from './types.js';

// Minimum gap between scheduled runs to prevent spin-loops
const MIN_REFIRE_GAP_MS = 2_000;

/**
 * Compute the next run time for a schedule.
 *
 * @param schedule - The schedule to compute
 * @param nowMs - Current time in milliseconds (defaults to Date.now())
 * @returns Next run time in milliseconds, or undefined if schedule has expired/invalid
 */
export function computeNextRunAtMs(schedule: CronSchedule, nowMs: number = Date.now()): number | undefined {
  switch (schedule.kind) {
    case 'at': {
      const targetMs = new Date(schedule.at).getTime();
      if (isNaN(targetMs)) return undefined;
      return targetMs > nowMs ? targetMs : undefined;
    }

    case 'every': {
      const anchor = schedule.anchorMs ?? nowMs;
      if (schedule.everyMs <= 0) return undefined;
      const elapsed = nowMs - anchor;
      const periods = Math.ceil(elapsed / schedule.everyMs);
      const next = anchor + periods * schedule.everyMs;
      // If next === nowMs (exactly on the interval), push to next period
      return next <= nowMs ? next + schedule.everyMs : next;
    }

    case 'cron': {
      try {
        const tz = schedule.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const cron = new Cron(schedule.expr, { timezone: tz });
        const now = new Date(nowMs);
        let next = cron.nextRun(now);

        // Workaround for croner year-rollback edge case:
        // If result is at or before now, try from the next second
        if (next && next.getTime() <= nowMs) {
          const nextSecond = new Date(nowMs + 1000);
          next = cron.nextRun(nextSecond);
        }

        if (!next) return undefined;
        const nextMs = next.getTime();
        // Ensure minimum gap to prevent spin-loops
        return nextMs > nowMs + MIN_REFIRE_GAP_MS ? nextMs : nowMs + MIN_REFIRE_GAP_MS;
      } catch {
        return undefined; // Invalid cron expression
      }
    }
  }
}

/**
 * Check if a schedule is valid
 */
export function isValidSchedule(schedule: CronSchedule): boolean {
  return computeNextRunAtMs(schedule, Date.now()) !== undefined;
}

/**
 * Format a schedule as human-readable string
 */
export function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'at':
      return `at ${schedule.at}`;
    case 'every':
      if (schedule.everyMs < 60000) {
        return `every ${schedule.everyMs}ms`;
      } else if (schedule.everyMs < 3600000) {
        return `every ${schedule.everyMs / 60000} minutes`;
      } else {
        return `every ${schedule.everyMs / 3600000} hours`;
      }
    case 'cron':
      return `cron: ${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ''}`;
  }
}
