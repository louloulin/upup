/**
 * @upup/cron - UpUp Cron System
 *
 * Provides cron job types, schedule computation, and job management.
 */

// Schedule types
export type {
  CronSchedule,
  CronScheduleAt,
  CronScheduleEvery,
  CronScheduleCron,
  ActiveHours,
  FulfillmentMode,
  CronPayload,
  CronJobState,
  CronJob,
  CronStore,
} from './types';

// Cron errors are intentionally not exported yet; consumers raise
// standard Error instances with descriptive messages.

// Schedule computation
export {
  computeNextRunAtMs,
} from './schedule';

export { loadCronStore, saveCronStore, getCronStorePath } from './store';
export { executeCronJob, type CronExecutionRuntime } from './executor';
export { startCronRunner, type CronRunner } from './runner';
export { ensureHeartbeatCronJob } from './heartbeat-migration';
