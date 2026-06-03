/**
 * Tests for the feature-gates module.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/feature-gates
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  createFeatureGates,
  featureGates,
  fnv1a,
  resetDefaultGates,
} from './feature-gates.js';

const COMPILE = (n: string) => `BUN_CONFIG_FEATURE_${n.toUpperCase()}`;
const STARTUP = (n: string) => `FEATURE_${n.toUpperCase()}`;

describe('fnv1a', () => {
  test('deterministic — same input yields same hash', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
  });
  test('different inputs yield different hashes (smoke test)', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('world'));
  });
  test('hashes are in [0, 2^32)', () => {
    for (const s of ['', 'a', 'kairos', 'user-123', 'long-string-' + 'x'.repeat(100)]) {
      const h = fnv1a(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('createFeatureGates', () => {
  let savedCompile: Record<string, string | undefined>;
  let savedStartup: Record<string, string | undefined>;

  beforeEach(() => {
    savedCompile = {};
    savedStartup = {};
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('BUN_CONFIG_FEATURE_')) savedCompile[k] = process.env[k];
      if (k.startsWith('FEATURE_')) savedStartup[k] = process.env[k];
    }
    for (const k of Object.keys(savedCompile)) delete process.env[k];
    for (const k of Object.keys(savedStartup)) delete process.env[k];
  });

  afterEach(() => {
    for (const k of Object.keys(savedCompile)) {
      if (savedCompile[k] === undefined) delete process.env[k];
      else process.env[k] = savedCompile[k];
    }
    for (const k of Object.keys(savedStartup)) {
      if (savedStartup[k] === undefined) delete process.env[k];
      else process.env[k] = savedStartup[k];
    }
  });

  test('default state: unregistered gate is disabled', () => {
    const g = createFeatureGates();
    expect(g.isEnabled('unknown')).toBe(false);
  });

  test('register() enables by default', () => {
    const g = createFeatureGates();
    g.register('kairos');
    expect(g.isEnabled('kairos')).toBe(true);
  });

  test('register(defaultEnabled: false) keeps it off', () => {
    const g = createFeatureGates();
    g.register('experimental', { defaultEnabled: false });
    expect(g.isEnabled('experimental')).toBe(false);
  });

  test('compile-time gate overrides default', () => {
    const g = createFeatureGates();
    g.register('trading');
    process.env[COMPILE('trading')] = '0';
    expect(g.isEnabled('trading')).toBe(false);
    process.env[COMPILE('trading')] = '1';
    expect(g.isEnabled('trading')).toBe(true);
  });

  test('startup gate (FEATURE_*) overrides default and is read from env', () => {
    const g = createFeatureGates();
    g.register('kairos');
    process.env[STARTUP('kairos')] = 'false';
    expect(g.isEnabled('kairos')).toBe(false);
    process.env[STARTUP('kairos')] = 'true';
    expect(g.isEnabled('kairos')).toBe(true);
  });

  test('runtime set() wins over compile and startup', () => {
    const g = createFeatureGates();
    process.env[COMPILE('trading')] = '0';
    g.set('trading', { force: true });
    expect(g.isEnabled('trading')).toBe(true);
    g.clearRuntime('trading');
    expect(g.isEnabled('trading')).toBe(false);
  });

  test('runtime ratio: 0 disables, 1 enables', () => {
    const g = createFeatureGates();
    g.set('kairos', { ratio: 0 });
    expect(g.isEnabled('kairos', { userId: 'anyone' })).toBe(false);
    g.set('kairos', { ratio: 1 });
    expect(g.isEnabled('kairos', { userId: 'anyone' })).toBe(true);
  });

  test('runtime ratio: 10% rollout uses deterministic hash', () => {
    const g = createFeatureGates();
    g.set('kairos', { ratio: 0.1 });
    // Run 1000 fake user ids and count inclusion. Expect ~10% (5%..15%).
    let hits = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (g.isEnabled('kairos', { userId: `user-${i}` })) hits++;
    }
    const rate = hits / N;
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.15);
  });

  test('runtime ratio: same userId always lands in the same bucket', () => {
    const g = createFeatureGates();
    g.set('kairos', { ratio: 0.4 });
    const a1 = g.isEnabled('kairos', { userId: 'alice' });
    const a2 = g.isEnabled('kairos', { userId: 'alice' });
    expect(a1).toBe(a2);
  });

  test('without userId, runtime ratio falls back to enabled (dev mode)', () => {
    const g = createFeatureGates();
    g.set('kairos', { ratio: 0 });
    expect(g.isEnabled('kairos')).toBe(true);
  });

  test('inspect() reports source = runtime for set() gates', () => {
    const g = createFeatureGates();
    g.set('kairos', { ratio: 0.5 });
    const s = g.inspect('kairos');
    expect(s.source).toBe('runtime');
    expect(s.ratio).toBe(0.5);
  });

  test('inspect() reports source = compile for BUN_CONFIG_FEATURE_*', () => {
    const g = createFeatureGates();
    process.env[COMPILE('trading')] = '0';
    expect(g.inspect('trading').source).toBe('compile');
  });

  test('inspect() reports source = startup for FEATURE_*', () => {
    const g = createFeatureGates();
    process.env[STARTUP('kairos')] = 'true';
    expect(g.inspect('kairos').source).toBe('startup');
  });

  test('inspect() reports source = default when nothing is set', () => {
    const g = createFeatureGates();
    g.register('kairos');
    expect(g.inspect('kairos').source).toBe('default');
  });

  test('doctor() returns states for registered gates and env-detected gates', () => {
    const g = createFeatureGates();
    g.register('kairos');
    g.register('trading');
    process.env[COMPILE('trading')] = '0';
    process.env[STARTUP('kairos')] = 'true';
    const report = g.doctor();
    const names = report.map((s) => s.name);
    expect(names).toContain('kairos');
    expect(names).toContain('trading');
    const kairos = report.find((s) => s.name === 'kairos')!;
    const trading = report.find((s) => s.name === 'trading')!;
    expect(kairos.source).toBe('startup');
    expect(kairos.enabled).toBe(true);
    expect(trading.source).toBe('compile');
    expect(trading.enabled).toBe(false);
  });

  test('parseBool tolerates truthy/falsy spellings', () => {
    process.env[STARTUP('x')] = 'YES';
    expect(createFeatureGates().isEnabled('x')).toBe(true);
    process.env[STARTUP('x')] = 'off';
    expect(createFeatureGates().isEnabled('x')).toBe(false);
    process.env[STARTUP('x')] = 'truthy-but-not-bool';
    expect(createFeatureGates().isEnabled('x')).toBe(false);
  });
});

describe('module-level featureGates (lazy default)', () => {
  beforeEach(() => resetDefaultGates());
  afterEach(() => resetDefaultGates());

  test('uses getDefaultGates() under the hood', () => {
    featureGates.register('lazy');
    expect(featureGates.isEnabled('lazy')).toBe(true);
  });
});
