/**
 * Cron platform surface — single place that knows about `@upup/cron`.
 *
 * The `@upup/pi-session` package must NOT import `@upup/cron` directly.
 * It only consumes this re-export surface so the cron store, runner,
 * executor, and heartbeat migration can be swapped from a single
 * boundary.
 */
import {
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  saveCronStore,
  startCronRunner,
  type CronExecutionRuntime,
  type CronJob,
  type CronRunner,
  type CronStore,
} from '@upup/cron';

export {
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  saveCronStore,
  startCronRunner,
};
export type { CronExecutionRuntime, CronJob, CronRunner, CronStore };

/**
 * The replaceable provider surface that the session composition layer
 * consumes for cron work. Each function is independent so callers can
 * swap the store path, the heartbeat policy, the executor, or the
 * long-running runner without rewriting the rest of the platform.
 */
export interface CronPlatformProvider {
  readonly loadCronStore: typeof loadCronStore;
  readonly saveCronStore: typeof saveCronStore;
  readonly ensureHeartbeatCronJob: typeof ensureHeartbeatCronJob;
  readonly executeCronJob: typeof executeCronJob;
  readonly startCronRunner: typeof startCronRunner;
}

/**
 * Default provider backed by the file-system cron store shipped in
 * `@upup/cron`. Tests and alternative deployments can construct their
 * own {@link CronPlatformProvider} with stubbed functions while keeping
 * the rest of the platform composition intact.
 */
export const defaultCronPlatformProvider: CronPlatformProvider = {
  loadCronStore,
  saveCronStore,
  ensureHeartbeatCronJob,
  executeCronJob,
  startCronRunner,
};
