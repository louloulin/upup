/**
 * Bridge poll interval defaults. Extracted from pollConfig.ts so callers
 * that don't need live runtime tuning (e.g. test fixtures) can avoid the
 * growthbook / feature-gates dependency chain.
 */

/**
 * Poll interval when actively seeking work (no transport / below maxSessions).
 * Governs user-visible "connecting…" latency on initial work pickup and
 * recovery speed after the server re-dispatches a work item.
 */
const POLL_INTERVAL_MS_NOT_AT_CAPACITY = 2000;

/**
 * Poll interval when the transport is connected. Runs independently of
 * heartbeat — when both are enabled, the heartbeat loop breaks out to poll
 * at this interval. Set to 0 to disable at-capacity polling entirely.
 *
 * 10 minutes gives 24× headroom on a typical 4h Redis TTL while still
 * picking up server-initiated token-rotation redispatches within one cycle.
 * The transport auto-reconnects internally for transient WS failures, so
 * poll is strictly a liveness signal plus a backstop for permanent close.
 */
const POLL_INTERVAL_MS_AT_CAPACITY = 600_000;

/** Multisession bridge poll intervals — match single-session defaults. */
const MULTISESSION_POLL_INTERVAL_MS_NOT_AT_CAPACITY = POLL_INTERVAL_MS_NOT_AT_CAPACITY;
const MULTISESSION_POLL_INTERVAL_MS_PARTIAL_CAPACITY = POLL_INTERVAL_MS_NOT_AT_CAPACITY;
const MULTISESSION_POLL_INTERVAL_MS_AT_CAPACITY = POLL_INTERVAL_MS_AT_CAPACITY;

export interface PollIntervalConfig {
  poll_interval_ms_not_at_capacity: number;
  /** 0 = disabled. Must be 0 or ≥100. */
  poll_interval_ms_at_capacity: number;
  /** 0 = disabled. Must be ≥0. */
  non_exclusive_heartbeat_interval_ms: number;
  multisession_poll_interval_ms_not_at_capacity: number;
  multisession_poll_interval_ms_partial_capacity: number;
  /** 0 = disabled. Must be 0 or ≥100. */
  multisession_poll_interval_ms_at_capacity: number;
  /** Poll query param: reclaim unacknowledged work items older than this. */
  reclaim_older_than_ms: number;
  /** 0 = disabled. Push a silent keepalive frame at this interval. */
  session_keepalive_interval_v2_ms: number;
}

export const DEFAULT_POLL_CONFIG: PollIntervalConfig = {
  poll_interval_ms_not_at_capacity: POLL_INTERVAL_MS_NOT_AT_CAPACITY,
  poll_interval_ms_at_capacity: POLL_INTERVAL_MS_AT_CAPACITY,
  // 0 = disabled. When > 0, at-capacity loops send per-work-item heartbeats
  // at this interval. 60s gives 5× headroom under a 300s heartbeat TTL.
  non_exclusive_heartbeat_interval_ms: 0,
  multisession_poll_interval_ms_not_at_capacity:
    MULTISESSION_POLL_INTERVAL_MS_NOT_AT_CAPACITY,
  multisession_poll_interval_ms_partial_capacity:
    MULTISESSION_POLL_INTERVAL_MS_PARTIAL_CAPACITY,
  multisession_poll_interval_ms_at_capacity:
    MULTISESSION_POLL_INTERVAL_MS_AT_CAPACITY,
  // Poll query param: reclaim unacknowledged work items older than this.
  // Matches typical server default (work_service).
  reclaim_older_than_ms: 5000,
  // 0 = disabled. Push a silent {type:'keep_alive'} frame at this interval
  // so upstream proxies don't GC an idle remote-control session.
  session_keepalive_interval_v2_ms: 120_000,
};
