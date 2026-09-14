/**
 * Env-less bridge timing config.
 *
 * Used by the env-less (v2) bridge path which derives all connection
 * parameters from this config (no environment variables required at
 * runtime — config is embedded in the binary and tuned via runtime
 * overrides for ops). The v1 env-based path uses a separate config
 * pipeline and is not affected by changes here.
 *
 * The config covers:
 *   - Init-phase retry (createSession, POST /bridge, recovery /bridge)
 *   - HTTP timeouts for the various API calls
 *   - Heartbeat cadence (CCR worker side) and per-beat jitter
 *   - Token refresh buffer (fire proactive refresh this long before expiry)
 *   - Teardown archive timeout (gracefulShutdown cleanup race budget)
 *   - Connect timeout (deadline for onConnect after transport.connect())
 *   - Minimum CLI version (semver floor; below this, prompt user to update)
 *   - App-upgrade nudge bit (claude.ai app may be too old to see v2 sessions)
 *
 * Validation: any single invalid field falls back to DEFAULT — same
 * defense-in-depth as pollConfig.ts. Bounds match observed p99 latencies
 * with appropriate headroom; caps prevent ops from setting values that
 * would burn through gracefulShutdown's 2s cleanup race or invert
 * token-refresh-buffer-vs-delay semantics.
 */
const ENV_OVERRIDE_KEY = 'UPUP_ENV_LESS_BRIDGE_CONFIG';
const RUNTIME_OVERRIDE_KEY = '__upupEnvLessBridgeConfigOverride' as const;

export interface EnvLessBridgeConfig {
  /** Init-phase max attempts (1-10). */
  init_retry_max_attempts: number;
  /** Base delay for init retry (≥100ms). */
  init_retry_base_delay_ms: number;
  /** Jitter fraction added to retry delays (0-1). */
  init_retry_jitter_fraction: number;
  /** Cap on retry delay after backoff (≥500ms, must be ≥ base). */
  init_retry_max_delay_ms: number;
  /** Axios timeout for HTTP API calls (≥2000ms). */
  http_timeout_ms: number;
  /** Bounded UUID set ring size for echo + re-delivery dedup (100-50000). */
  uuid_dedup_buffer_size: number;
  /** Worker heartbeat cadence (5000-30000ms; server TTL 60s). */
  heartbeat_interval_ms: number;
  /** ±fraction jitter per heartbeat (0-0.5). */
  heartbeat_jitter_fraction: number;
  /** Proactive JWT refresh buffer (30000-1800000ms). */
  token_refresh_buffer_ms: number;
  /** Archive POST timeout in teardown (500-2000ms; below gracefulShutdown 2s cap). */
  teardown_archive_timeout_ms: number;
  /** Deadline for onConnect after transport.connect() (5000-60000ms). */
  connect_timeout_ms: number;
  /** Semver floor; below this, prompt user to upgrade. */
  min_version: string;
  /** True: nudge user that their claude.ai app may be too old. */
  should_show_app_upgrade_message: boolean;
}

export const DEFAULT_ENV_LESS_BRIDGE_CONFIG: EnvLessBridgeConfig = {
  init_retry_max_attempts: 3,
  init_retry_base_delay_ms: 500,
  init_retry_jitter_fraction: 0.25,
  init_retry_max_delay_ms: 4000,
  http_timeout_ms: 10_000,
  uuid_dedup_buffer_size: 2000,
  heartbeat_interval_ms: 20_000,
  heartbeat_jitter_fraction: 0.1,
  token_refresh_buffer_ms: 300_000,
  teardown_archive_timeout_ms: 1500,
  connect_timeout_ms: 15_000,
  min_version: '0.0.0',
  should_show_app_upgrade_message: false,
};

interface OverrideHolder {
  [RUNTIME_OVERRIDE_KEY]?: unknown;
}

function getRuntimeOverride(): unknown {
  return (globalThis as unknown as OverrideHolder)[RUNTIME_OVERRIDE_KEY];
}

/**
 * Strict int-with-bound check. Returns the value if it passes, else null.
 */
function checkInt(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | null {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || !Number.isFinite(v)) {
    return null;
  }
  if (v < min || v > max) return null;
  return v;
}

function checkNum(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | null {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return null;
  }
  if (v < min || v > max) return null;
  return v;
}

function checkBool(obj: Record<string, unknown>, key: string): boolean | null {
  const v = obj[key];
  if (typeof v !== 'boolean') return null;
  return v;
}

function checkSemver(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) return null;
  // Loose semver: MAJOR.MINOR.PATCH, each numeric, optional -prerelease.
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) return null;
  return v;
}

/**
 * Validate a candidate EnvLessBridgeConfig. Returns the validated config
 * if every field passes, or DEFAULT_ENV_LESS_BRIDGE_CONFIG on any failure.
 */
export function validateEnvLessBridgeConfig(raw: unknown): EnvLessBridgeConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_ENV_LESS_BRIDGE_CONFIG;
  const r = raw as Record<string, unknown>;

  const initRetryMax = checkInt(r, 'init_retry_max_attempts', 1, 10);
  if (initRetryMax === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const initRetryBase = checkInt(r, 'init_retry_base_delay_ms', 100, 60_000);
  if (initRetryBase === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const initRetryJitter = checkNum(r, 'init_retry_jitter_fraction', 0, 1);
  if (initRetryJitter === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const initRetryMaxDelay = checkInt(r, 'init_retry_max_delay_ms', 500, 300_000);
  if (initRetryMaxDelay === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;
  // Cap must be ≥ base (otherwise backoff is meaningless).
  if (initRetryMaxDelay < initRetryBase) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const httpTimeout = checkInt(r, 'http_timeout_ms', 2000, 300_000);
  if (httpTimeout === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const uuidBuffer = checkInt(r, 'uuid_dedup_buffer_size', 100, 50_000);
  if (uuidBuffer === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const heartbeat = checkInt(r, 'heartbeat_interval_ms', 5000, 30_000);
  if (heartbeat === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const heartbeatJitter = checkNum(r, 'heartbeat_jitter_fraction', 0, 0.5);
  if (heartbeatJitter === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const tokenBuffer = checkInt(r, 'token_refresh_buffer_ms', 30_000, 1_800_000);
  if (tokenBuffer === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const teardownTimeout = checkInt(r, 'teardown_archive_timeout_ms', 500, 2000);
  if (teardownTimeout === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const connectTimeout = checkInt(r, 'connect_timeout_ms', 5000, 60_000);
  if (connectTimeout === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const minVersion = checkSemver(r, 'min_version');
  if (minVersion === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  const upgradeMsg = checkBool(r, 'should_show_app_upgrade_message');
  if (upgradeMsg === null) return DEFAULT_ENV_LESS_BRIDGE_CONFIG;

  return {
    init_retry_max_attempts: initRetryMax,
    init_retry_base_delay_ms: initRetryBase,
    init_retry_jitter_fraction: initRetryJitter,
    init_retry_max_delay_ms: initRetryMaxDelay,
    http_timeout_ms: httpTimeout,
    uuid_dedup_buffer_size: uuidBuffer,
    heartbeat_interval_ms: heartbeat,
    heartbeat_jitter_fraction: heartbeatJitter,
    token_refresh_buffer_ms: tokenBuffer,
    teardown_archive_timeout_ms: teardownTimeout,
    connect_timeout_ms: connectTimeout,
    min_version: minVersion,
    should_show_app_upgrade_message: upgradeMsg,
  };
}

/**
 * Resolve the live env-less bridge config. Priority:
 * 1. globalThis runtime override (test fixtures, ops hot-patch)
 * 2. UPUP_ENV_LESS_BRIDGE_CONFIG env var (JSON-encoded)
 * 3. DEFAULT_ENV_LESS_BRIDGE_CONFIG
 *
 * Any malformed/partial config falls back to DEFAULT.
 */
export function getEnvLessBridgeConfig(): EnvLessBridgeConfig {
  const runtimeOverride = getRuntimeOverride();
  if (runtimeOverride !== undefined) {
    return validateEnvLessBridgeConfig(runtimeOverride);
  }

  const envRaw = process.env[ENV_OVERRIDE_KEY];
  if (envRaw) {
    try {
      return validateEnvLessBridgeConfig(JSON.parse(envRaw));
    } catch {
      return DEFAULT_ENV_LESS_BRIDGE_CONFIG;
    }
  }

  return DEFAULT_ENV_LESS_BRIDGE_CONFIG;
}

/** Test/internal: set the runtime override. Pass undefined to clear. */
export function _setEnvLessBridgeConfigOverride(cfg: unknown): void {
  (globalThis as unknown as OverrideHolder)[RUNTIME_OVERRIDE_KEY] = cfg;
}

/**
 * Compute the retry delay for a given attempt (0-indexed) using
 * exponential backoff with the configured jitter fraction.
 *
 *   delay = min(base * 2^attempt, max) ± jitter
 *
 * Returns the base delay (no jitter) when `jitterFraction` is 0.
 */
export function computeRetryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterFraction: number,
  random: () => number = Math.random,
): number {
  if (attempt < 0) attempt = 0;
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  if (jitterFraction <= 0) return exp;
  const jitter = exp * jitterFraction * (random() * 2 - 1); // ±jitter
  return Math.max(0, Math.floor(exp + jitter));
}
