import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  validatePollConfig,
  getPollIntervalConfig,
  _setPollConfigOverride,
} from './pollConfig.js';
import { DEFAULT_POLL_CONFIG } from './pollConfigDefaults.js';

const VALID_CONFIG = {
  poll_interval_ms_not_at_capacity: 1500,
  poll_interval_ms_at_capacity: 300_000,
  non_exclusive_heartbeat_interval_ms: 30_000,
  multisession_poll_interval_ms_not_at_capacity: 1500,
  multisession_poll_interval_ms_partial_capacity: 1500,
  multisession_poll_interval_ms_at_capacity: 300_000,
  reclaim_older_than_ms: 5000,
  session_keepalive_interval_v2_ms: 60_000,
};

describe('pollConfig — validatePollConfig', () => {
  test('returns DEFAULT for null/undefined/non-object input', () => {
    expect(validatePollConfig(null)).toBe(DEFAULT_POLL_CONFIG);
    expect(validatePollConfig(undefined)).toBe(DEFAULT_POLL_CONFIG);
    expect(validatePollConfig('string')).toBe(DEFAULT_POLL_CONFIG);
    expect(validatePollConfig(42)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('accepts a fully-valid config', () => {
    const result = validatePollConfig(VALID_CONFIG);
    expect(result.poll_interval_ms_not_at_capacity).toBe(1500);
    expect(result.poll_interval_ms_at_capacity).toBe(300_000);
  });

  test('rejects poll_interval_ms_not_at_capacity < 100 (fat-finger floor)', () => {
    const bad = { ...VALID_CONFIG, poll_interval_ms_not_at_capacity: 50 };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('rejects poll_interval_ms_at_capacity in 1..99 (unit confusion guard)', () => {
    const bad = { ...VALID_CONFIG, poll_interval_ms_at_capacity: 50 };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('accepts poll_interval_ms_at_capacity = 0 (disabled)', () => {
    const ok = { ...VALID_CONFIG, poll_interval_ms_at_capacity: 0, non_exclusive_heartbeat_interval_ms: 60_000 };
    const result = validatePollConfig(ok);
    expect(result.poll_interval_ms_at_capacity).toBe(0);
  });

  test('rejects negative heartbeat interval', () => {
    const bad = { ...VALID_CONFIG, non_exclusive_heartbeat_interval_ms: -1 };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('rejects reclaim_older_than_ms < 1', () => {
    const bad = { ...VALID_CONFIG, reclaim_older_than_ms: 0 };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('rejects negative keepalive interval', () => {
    const bad = { ...VALID_CONFIG, session_keepalive_interval_v2_ms: -1 };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('rejects non-integer values', () => {
    const bad = { ...VALID_CONFIG, poll_interval_ms_not_at_capacity: 100.5 };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('rejects when at-capacity liveness is fully off (heartbeat=0, atCap=0)', () => {
    const bad = {
      ...VALID_CONFIG,
      poll_interval_ms_at_capacity: 0,
      multisession_poll_interval_ms_at_capacity: 0,
      non_exclusive_heartbeat_interval_ms: 0,
    };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('rejects non-numeric field', () => {
    const bad = { ...VALID_CONFIG, poll_interval_ms_not_at_capacity: 'fast' };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
  });

  test('accepts NaN/Infinity as invalid and falls back', () => {
    const bad = { ...VALID_CONFIG, poll_interval_ms_not_at_capacity: NaN };
    expect(validatePollConfig(bad)).toBe(DEFAULT_POLL_CONFIG);
    const bad2 = { ...VALID_CONFIG, poll_interval_ms_not_at_capacity: Infinity };
    expect(validatePollConfig(bad2)).toBe(DEFAULT_POLL_CONFIG);
  });
});

describe('pollConfig — getPollIntervalConfig resolution', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    _setPollConfigOverride(undefined);
    savedEnv = process.env.UPUP_BRIDGE_POLL_CONFIG;
    delete process.env.UPUP_BRIDGE_POLL_CONFIG;
  });

  afterEach(() => {
    _setPollConfigOverride(undefined);
    if (savedEnv !== undefined) process.env.UPUP_BRIDGE_POLL_CONFIG = savedEnv;
    else delete process.env.UPUP_BRIDGE_POLL_CONFIG;
  });

  test('returns DEFAULT when no override and no env', () => {
    expect(getPollIntervalConfig()).toBe(DEFAULT_POLL_CONFIG);
  });

  test('runtime override beats env var', () => {
    process.env.UPUP_BRIDGE_POLL_CONFIG = JSON.stringify(VALID_CONFIG);
    _setPollConfigOverride({
      ...VALID_CONFIG,
      poll_interval_ms_not_at_capacity: 7777,
    });
    const result = getPollIntervalConfig();
    expect(result.poll_interval_ms_not_at_capacity).toBe(7777);
  });

  test('env var override is parsed and applied when valid', () => {
    process.env.UPUP_BRIDGE_POLL_CONFIG = JSON.stringify(VALID_CONFIG);
    const result = getPollIntervalConfig();
    expect(result.poll_interval_ms_not_at_capacity).toBe(1500);
  });

  test('env var malformed JSON falls back to DEFAULT', () => {
    process.env.UPUP_BRIDGE_POLL_CONFIG = '{not json';
    expect(getPollIntervalConfig()).toBe(DEFAULT_POLL_CONFIG);
  });

  test('env var valid JSON but invalid config falls back to DEFAULT', () => {
    process.env.UPUP_BRIDGE_POLL_CONFIG = JSON.stringify({
      poll_interval_ms_not_at_capacity: 10, // too small
    });
    expect(getPollIntervalConfig()).toBe(DEFAULT_POLL_CONFIG);
  });

  test('runtime override invalid falls back to DEFAULT', () => {
    _setPollConfigOverride({ poll_interval_ms_not_at_capacity: 10 });
    expect(getPollIntervalConfig()).toBe(DEFAULT_POLL_CONFIG);
  });

  test('runtime override undefined clears back to env/DEFAULT', () => {
    _setPollConfigOverride({ ...VALID_CONFIG, poll_interval_ms_not_at_capacity: 9999 });
    expect(getPollIntervalConfig().poll_interval_ms_not_at_capacity).toBe(9999);
    _setPollConfigOverride(undefined);
    expect(getPollIntervalConfig()).toBe(DEFAULT_POLL_CONFIG);
  });
});
