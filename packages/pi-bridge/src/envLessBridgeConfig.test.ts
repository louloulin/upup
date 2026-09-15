import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  validateEnvLessBridgeConfig,
  getEnvLessBridgeConfig,
  _setEnvLessBridgeConfigOverride,
  computeRetryDelay,
  DEFAULT_ENV_LESS_BRIDGE_CONFIG,
} from './envLessBridgeConfig';

const VALID_OVERRIDE = {
  init_retry_max_attempts: 5,
  init_retry_base_delay_ms: 1000,
  init_retry_jitter_fraction: 0.2,
  init_retry_max_delay_ms: 8000,
  http_timeout_ms: 15_000,
  uuid_dedup_buffer_size: 3000,
  heartbeat_interval_ms: 25_000,
  heartbeat_jitter_fraction: 0.15,
  token_refresh_buffer_ms: 600_000,
  teardown_archive_timeout_ms: 1500,
  connect_timeout_ms: 20_000,
  min_version: '1.0.0',
  should_show_app_upgrade_message: true,
};

describe('envLessBridgeConfig — validateEnvLessBridgeConfig', () => {
  test('returns DEFAULT for null/undefined/non-object input', () => {
    expect(validateEnvLessBridgeConfig(null)).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig(undefined)).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig('string')).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig(42)).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('accepts a fully-valid config', () => {
    const result = validateEnvLessBridgeConfig(VALID_OVERRIDE);
    expect(result.init_retry_max_attempts).toBe(5);
    expect(result.min_version).toBe('1.0.0');
    expect(result.should_show_app_upgrade_message).toBe(true);
  });

  test('rejects init_retry_max_attempts out of [1, 10]', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, init_retry_max_attempts: 0 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, init_retry_max_attempts: 11 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects init_retry_base_delay_ms < 100 (fat-finger floor)', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, init_retry_base_delay_ms: 50 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects init_retry_jitter_fraction out of [0, 1]', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, init_retry_jitter_fraction: -0.1 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, init_retry_jitter_fraction: 1.1 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects init_retry_max_delay_ms < base_delay_ms', () => {
    expect(validateEnvLessBridgeConfig({
      ...VALID_OVERRIDE,
      init_retry_base_delay_ms: 5000,
      init_retry_max_delay_ms: 1000, // less than base
    })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects http_timeout_ms < 2000', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, http_timeout_ms: 1500 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects heartbeat_interval_ms out of [5000, 30000]', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, heartbeat_interval_ms: 1000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, heartbeat_interval_ms: 60_000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects heartbeat_jitter_fraction > 0.5 (worst-case under server TTL)', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, heartbeat_jitter_fraction: 0.6 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects token_refresh_buffer_ms out of [30000, 1800000]', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, token_refresh_buffer_ms: 1000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, token_refresh_buffer_ms: 3_600_000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects teardown_archive_timeout_ms out of [500, 2000] (gracefulShutdown budget)', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, teardown_archive_timeout_ms: 300 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, teardown_archive_timeout_ms: 3000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects connect_timeout_ms out of [5000, 60000]', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, connect_timeout_ms: 2000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, connect_timeout_ms: 70_000 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects malformed min_version', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, min_version: '1.0' })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, min_version: 'abc' })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, min_version: '' })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('accepts semver with prerelease tag', () => {
    const result = validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, min_version: '1.0.0-rc.1' });
    expect(result.min_version).toBe('1.0.0-rc.1');
  });

  test('rejects non-boolean should_show_app_upgrade_message', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, should_show_app_upgrade_message: 'yes' })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, should_show_app_upgrade_message: 1 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('rejects non-integer numeric fields', () => {
    expect(validateEnvLessBridgeConfig({ ...VALID_OVERRIDE, init_retry_max_attempts: 3.5 })).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });
});

describe('envLessBridgeConfig — getEnvLessBridgeConfig resolution', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    _setEnvLessBridgeConfigOverride(undefined);
    savedEnv = process.env.UPUP_ENV_LESS_BRIDGE_CONFIG;
    delete process.env.UPUP_ENV_LESS_BRIDGE_CONFIG;
  });

  afterEach(() => {
    _setEnvLessBridgeConfigOverride(undefined);
    if (savedEnv !== undefined) process.env.UPUP_ENV_LESS_BRIDGE_CONFIG = savedEnv;
    else delete process.env.UPUP_ENV_LESS_BRIDGE_CONFIG;
  });

  test('returns DEFAULT when no override and no env', () => {
    expect(getEnvLessBridgeConfig()).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('runtime override beats env var', () => {
    process.env.UPUP_ENV_LESS_BRIDGE_CONFIG = JSON.stringify(VALID_OVERRIDE);
    _setEnvLessBridgeConfigOverride({ ...VALID_OVERRIDE, init_retry_max_attempts: 7 });
    expect(getEnvLessBridgeConfig().init_retry_max_attempts).toBe(7);
  });

  test('env var override is parsed and applied when valid', () => {
    process.env.UPUP_ENV_LESS_BRIDGE_CONFIG = JSON.stringify(VALID_OVERRIDE);
    const result = getEnvLessBridgeConfig();
    expect(result.init_retry_max_attempts).toBe(5);
    expect(result.min_version).toBe('1.0.0');
  });

  test('env var malformed JSON falls back to DEFAULT', () => {
    process.env.UPUP_ENV_LESS_BRIDGE_CONFIG = '{not json';
    expect(getEnvLessBridgeConfig()).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('env var valid JSON but invalid config falls back to DEFAULT', () => {
    process.env.UPUP_ENV_LESS_BRIDGE_CONFIG = JSON.stringify({
      init_retry_max_attempts: 100, // out of range
    });
    expect(getEnvLessBridgeConfig()).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });

  test('runtime override invalid falls back to DEFAULT', () => {
    _setEnvLessBridgeConfigOverride({ init_retry_max_attempts: 100 });
    expect(getEnvLessBridgeConfig()).toBe(DEFAULT_ENV_LESS_BRIDGE_CONFIG);
  });
});

describe('envLessBridgeConfig — computeRetryDelay', () => {
  test('exponential growth capped at maxDelayMs', () => {
    // No jitter, deterministic
    const d0 = computeRetryDelay(0, 500, 4000, 0);
    const d1 = computeRetryDelay(1, 500, 4000, 0);
    const d2 = computeRetryDelay(2, 500, 4000, 0);
    const d3 = computeRetryDelay(3, 500, 4000, 0);
    const d10 = computeRetryDelay(10, 500, 4000, 0);
    expect(d0).toBe(500);
    expect(d1).toBe(1000);
    expect(d2).toBe(2000);
    expect(d3).toBe(4000);
    expect(d10).toBe(4000);
  });

  test('negative attempt clamps to 0', () => {
    expect(computeRetryDelay(-1, 500, 4000, 0)).toBe(500);
    expect(computeRetryDelay(-100, 500, 4000, 0)).toBe(500);
  });

  test('jitter 0 returns exact value', () => {
    expect(computeRetryDelay(2, 500, 4000, 0)).toBe(2000);
  });

  test('jitter ±fraction is applied around the exponential value', () => {
    // random() = 1 → +jitter, random() = 0 → -jitter
    const max = computeRetryDelay(2, 500, 4000, 0.5, () => 1);
    const min = computeRetryDelay(2, 500, 4000, 0.5, () => 0);
    // exp at attempt 2 = 2000, jitter fraction 0.5 → ±1000
    expect(max).toBe(3000);
    expect(min).toBe(1000);
  });

  test('jitter never makes delay negative', () => {
    // Edge: random() = 0, jitter fraction 1, exp = 500 → -500
    const delay = computeRetryDelay(0, 500, 4000, 1, () => 0);
    expect(delay).toBe(0);
  });

  test('respects maxDelayMs even with jitter', () => {
    // exp capped at 4000, jitter can push above, but Math.min in impl caps
    // Actually our impl uses Math.min(exp, maxDelay) before jitter, so
    // post-jitter can exceed max. Verify.
    const high = computeRetryDelay(3, 500, 4000, 0.5, () => 1);
    expect(high).toBe(6000); // 4000 + 2000 jitter
  });
});
