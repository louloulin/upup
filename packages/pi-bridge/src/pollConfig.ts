/**
 * Bridge poll interval config: validate candidate configs and resolve
 * the live config (env override > runtime override > defaults).
 *
 * Validation strategy: any single invalid field falls back to
 * DEFAULT_POLL_CONFIG entirely (no partial trust, no silent coercion).
 * This is a defense against fat-fingered runtime configs that would
 * otherwise cause tight-loop polling or unbounded sleep.
 */
import { DEFAULT_POLL_CONFIG, type PollIntervalConfig } from './pollConfigDefaults.js';

const ENV_OVERRIDE_KEY = 'UPUP_BRIDGE_POLL_CONFIG';
const RUNTIME_OVERRIDE_KEY = '__upupPollConfigOverride' as const;

interface OverrideHolder {
  [RUNTIME_OVERRIDE_KEY]?: unknown;
}

function getRuntimeOverride(): unknown {
  return (globalThis as unknown as OverrideHolder)[RUNTIME_OVERRIDE_KEY];
}

/**
 * Strict int-with-bound check. Returns the value if it is a finite integer
 * satisfying the bound, otherwise null. When `allowZero` is true, exactly
 * 0 is also accepted (used for "disabled" sentinel values).
 */
function checkInt(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  allowZero: boolean,
): number | null {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || !Number.isFinite(v)) {
    return null;
  }
  if (allowZero) {
    return v === 0 || v >= min ? v : null;
  }
  return v >= min ? v : null;
}

/**
 * Validate a candidate PollIntervalConfig. Returns the validated config if
 * every field passes, or DEFAULT_POLL_CONFIG on any single failure.
 */
export function validatePollConfig(raw: unknown): PollIntervalConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_POLL_CONFIG;
  const r = raw as Record<string, unknown>;

  const notAtCap = checkInt(r, 'poll_interval_ms_not_at_capacity', 100, false);
  if (notAtCap === null) return DEFAULT_POLL_CONFIG;

  const atCap = checkInt(r, 'poll_interval_ms_at_capacity', 100, true);
  if (atCap === null) return DEFAULT_POLL_CONFIG;

  const heartbeat = checkInt(r, 'non_exclusive_heartbeat_interval_ms', 0, true);
  if (heartbeat === null) return DEFAULT_POLL_CONFIG;

  const msNotAtCap = checkInt(r, 'multisession_poll_interval_ms_not_at_capacity', 100, false);
  if (msNotAtCap === null) return DEFAULT_POLL_CONFIG;

  const msPartial = checkInt(r, 'multisession_poll_interval_ms_partial_capacity', 100, false);
  if (msPartial === null) return DEFAULT_POLL_CONFIG;

  const msAtCap = checkInt(r, 'multisession_poll_interval_ms_at_capacity', 100, true);
  if (msAtCap === null) return DEFAULT_POLL_CONFIG;

  const reclaim = checkInt(r, 'reclaim_older_than_ms', 1, false);
  if (reclaim === null) return DEFAULT_POLL_CONFIG;

  const keepalive = checkInt(r, 'session_keepalive_interval_v2_ms', 0, true);
  if (keepalive === null) return DEFAULT_POLL_CONFIG;

  // At-capacity liveness gate: heartbeat > 0 OR poll > 0 (single + multi).
  // Otherwise the loop has no liveness mechanism and would tight-loop
  // /poll at HTTP-round-trip speed.
  const hasSingleLiveness = heartbeat > 0 || atCap > 0;
  const hasMultiLiveness = heartbeat > 0 || msAtCap > 0;
  if (!hasSingleLiveness || !hasMultiLiveness) return DEFAULT_POLL_CONFIG;

  return {
    poll_interval_ms_not_at_capacity: notAtCap,
    poll_interval_ms_at_capacity: atCap,
    non_exclusive_heartbeat_interval_ms: heartbeat,
    multisession_poll_interval_ms_not_at_capacity: msNotAtCap,
    multisession_poll_interval_ms_partial_capacity: msPartial,
    multisession_poll_interval_ms_at_capacity: msAtCap,
    reclaim_older_than_ms: reclaim,
    session_keepalive_interval_v2_ms: keepalive,
  };
}

/**
 * Resolve the live poll interval config. Priority:
 * 1. globalThis runtime override (test fixtures, ops hot-patch)
 * 2. UPUP_BRIDGE_POLL_CONFIG env var (JSON-encoded)
 * 3. DEFAULT_POLL_CONFIG
 *
 * Any malformed/partial config falls back to DEFAULT_POLL_CONFIG.
 */
export function getPollIntervalConfig(): PollIntervalConfig {
  const runtimeOverride = getRuntimeOverride();
  if (runtimeOverride !== undefined) {
    return validatePollConfig(runtimeOverride);
  }

  const envRaw = process.env[ENV_OVERRIDE_KEY];
  if (envRaw) {
    try {
      return validatePollConfig(JSON.parse(envRaw));
    } catch {
      return DEFAULT_POLL_CONFIG;
    }
  }

  return DEFAULT_POLL_CONFIG;
}

/**
 * Test/internal: set the runtime override. Pass undefined to clear.
 * Not for production use.
 */
export function _setPollConfigOverride(cfg: unknown): void {
  (globalThis as unknown as OverrideHolder)[RUNTIME_OVERRIDE_KEY] = cfg;
}
