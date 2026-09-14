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
} from './types.js';

// Cron errors are intentionally not exported yet; consumers raise
// standard Error instances with descriptive messages.

// Schedule computation
export {
  computeNextRunAtMs,
} from './schedule.js';

export { loadCronStore, saveCronStore, getCronStorePath } from './store.js';
export { executeCronJob, type CronExecutionRuntime } from './executor.js';
export { startCronRunner, type CronRunner } from './runner.js';
export { ensureHeartbeatCronJob } from './heartbeat-migration.js';
