/**
 * Tests for the coach role system. Verifies the public contract only:
 *
 *   - `isCoachCompiledIn()` reflects the feature-gate registry state
 *     (defaults to false because COACH_MODE is registered with
 *     `defaultEnabled: false`).
 *   - `isCoachEnabled()` is the AND of compile-time gate and the
 *     `UPUP_COACH_MODE` env (treats `0`/`false`/`off`/`no` as disabled).
 *   - `buildCoachSystemPrompt()` returns the empty string when the gate
 *     is off (no prompt pollution) and a non-empty composed prompt when
 *     the gate is force-enabled at runtime.
 *
 * The tests intentionally avoid asserting the exact prompt contents — the
 * contents are an implementation detail and would break every time a
 * sprint tunes the coach copy. We only assert the contract gates.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  buildCoachSystemPrompt,
  isCoachCompiledIn,
  isCoachEnabled,
} from './role-system.js';
import { featureGates } from './feature-gates.js';
import { buildDefaultInvestmentSystemPrompt } from './index.js';

const previousEnv: { coach?: string; feature?: string } = {};

beforeAll(() => {
  previousEnv.coach = process.env.UPUP_COACH_MODE;
  previousEnv.feature = process.env.BUN_CONFIG_FEATURE_COACH_MODE;
});

beforeEach(() => {
  delete process.env.UPUP_COACH_MODE;
  delete process.env.BUN_CONFIG_FEATURE_COACH_MODE;
  featureGates.clearRuntime('COACH_MODE');
});

afterEach(() => {
  if (previousEnv.coach === undefined) delete process.env.UPUP_COACH_MODE;
  else process.env.UPUP_COACH_MODE = previousEnv.coach;
  if (previousEnv.feature === undefined) {
    delete process.env.BUN_CONFIG_FEATURE_COACH_MODE;
  } else {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = previousEnv.feature;
  }
  // Always drop the runtime override so tests don't bleed into each other.
  featureGates.clearRuntime('COACH_MODE');
});

describe('coach role system', () => {
  test('owns the default Pi investment system prompt', () => {
    expect(buildDefaultInvestmentSystemPrompt()).toContain('powered by the Pi runtime');
  });
  test('compile-time gate reflects registry state (defaults to false)', () => {
    // COACH_MODE is registered with `defaultEnabled: false`, so without a
    // runtime override or compile-time env var the gate stays closed.
    expect(typeof isCoachCompiledIn()).toBe('boolean');
    expect(isCoachCompiledIn()).toBe(false);
  });

  test('isCoachEnabled honours negative env values', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    for (const v of ['0', 'false', 'off', 'no']) {
      process.env.UPUP_COACH_MODE = v;
      expect(isCoachEnabled()).toBe(false);
    }
  });

  test('returns empty string when coach is disabled by env', () => {
    process.env.UPUP_COACH_MODE = 'off';
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1'; // pretend it was compiled in
    expect(isCoachEnabled()).toBe(false);
    expect(buildCoachSystemPrompt()).toBe('');
  });

  test('returns empty string when compile-time gate is off', () => {
    delete process.env.UPUP_COACH_MODE;
    delete process.env.BUN_CONFIG_FEATURE_COACH_MODE;
    featureGates.clearRuntime('COACH_MODE');
    // Even if the env var says on, the compile-time gate wins.
    process.env.UPUP_COACH_MODE = 'on';
    expect(isCoachCompiledIn()).toBe(false);
    expect(isCoachEnabled()).toBe(false);
    expect(buildCoachSystemPrompt()).toBe('');
  });

  test('returns a non-empty composed prompt when force-enabled at runtime', () => {
    // Force the gate on without depending on the compile-time flag.
    featureGates.set('COACH_MODE', { force: true });
    process.env.UPUP_COACH_MODE = 'on';
    expect(isCoachCompiledIn()).toBe(true);
    expect(isCoachEnabled()).toBe(true);
    const prompt = buildCoachSystemPrompt();
    expect(prompt.length).toBeGreaterThan(0);
    // Sanity-check a stable substring that's been part of the prompt since v1.
    expect(prompt).toContain('核心准则');
  });

  test('context object is accepted without throwing when enabled', () => {
    featureGates.set('COACH_MODE', { force: true });
    process.env.UPUP_COACH_MODE = 'on';
    // The shape of CoachPromptContext evolved across sprints (watchlist is
    // now an array of `{ symbol, name }`), so we just assert that
    // supplying a context does not throw and still returns a non-empty
    // prompt.
    const prompt = buildCoachSystemPrompt({
      persona: 'active',
      riskAppetite: 'aggressive',
      style: 'momentum',
      watchlist: [{ symbol: '600519.SH' }, { symbol: 'AAPL', name: 'Apple' }],
    });
    expect(prompt.length).toBeGreaterThan(0);
  });
});
