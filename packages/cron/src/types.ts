/**
 * UpUp Cron System — Core Types
 *
 * Defines cron job types, schedule types, and job state types.
 */

// ============================================================================
// Schedule Types
// ============================================================================

/** Schedule: Run once at a specific time */
export type CronScheduleAt = {
  kind: 'at';
  at: string; // ISO date string
};

/** Schedule: Run every N milliseconds */
export type CronScheduleEvery = {
  kind: 'every';
  everyMs: number;
  anchorMs?: number;
};

/** Schedule: Run based on cron expression */
export type CronScheduleCron = {
  kind: 'cron';
  expr: string; // Cron expression (e.g., "0 9 * * 1-5")
  tz?: string;  // Timezone (e.g., "America/New_York")
};

/** Union of all schedule types */
export type CronSchedule = CronScheduleAt | CronScheduleEvery | CronScheduleCron;

// ============================================================================
// Active Hours
// ============================================================================

/** Define when jobs can run (market hours, etc.) */
export type ActiveHours = {
  start: string;        // "HH:MM" (e.g., "09:30")
  end: string;          // "HH:MM" (e.g., "16:00")
  timezone?: string;    // IANA timezone (default: America/New_York)
  daysOfWeek?: number[]; // 0=Sun..6=Sat (default: [1,2,3,4,5])
};

// ============================================================================
// Fulfillment
// ============================================================================

/** How to handle job firing during offline periods */
export type FulfillmentMode =
  | 'keep'    // Run when agent comes back online
  | 'once'    // Run once when agent comes back online
  | 'ask';    // Ask user before running

// ============================================================================
// Payload
// ============================================================================

/** The data that gets sent to the agent when a job fires */
export type CronPayload = {
  message: string;
  model?: string;
  modelProvider?: string;
};

// ============================================================================
// Job State
// ============================================================================

/** Runtime state of a cron job */
export type CronJobState = {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: 'ok' | 'error' | 'suppressed';
  lastError?: string;
  lastDurationMs?: number;
  consecutiveErrors: number;
  scheduleErrorCount: number;
};

// ============================================================================
// Job
// ============================================================================

/** A scheduled cron job */
export type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  payload: CronPayload;
  fulfillment: FulfillmentMode;
  activeHours?: ActiveHours;
  state: CronJobState;
};

// ============================================================================
// Store
// ============================================================================

/** The persisted job store */
export type CronStore = {
  version: 1;
  jobs: CronJob[];
};

// ============================================================================
// Errors
// ============================================================================

export class CronError extends Error {
  constructor(
    message: string,
    public code: string,
    public jobId?: string
  ) {
    super(message);
    this.name = 'CronError';
  }
}

export class CronScheduleError extends CronError {
  constructor(message: string, jobId?: string) {
    super(message, 'CRON_SCHEDULE_ERROR', jobId);
  }
}

export class CronExecutionError extends CronError {
  constructor(message: string, jobId?: string) {
    super(message, 'CRON_EXECUTION_ERROR', jobId);
  }
}
