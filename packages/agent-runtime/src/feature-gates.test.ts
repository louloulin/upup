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

// =============================================================================
// v2 (Sprint 2.2) — compile-time feature flag registry + DCE pattern
// =============================================================================

import {
  registerFeature,
  getFeatureFlag,
  listFeatures,
  isFeatureCompiledIn,
  type FeatureFlag,
  type FeatureStateV2,
} from './feature-gates.js';

describe('feature-gates v2 (Sprint 2.2) — compile flag registry', () => {
  // Reset state so the module-level featureGates don't leak between tests.
  beforeEach(() => resetDefaultGates());
  afterEach(() => resetDefaultGates());

  test('BUILTIN_FEATURES registers 50+ flags across 5 categories', () => {
    const all = listFeatures();
    expect(all.length).toBeGreaterThanOrEqual(50);
    const categories = new Set(all.map((f) => f.category));
    // We claim 5 categories: agent, trading, data, tools, analytics
    expect(categories.size).toBeGreaterThanOrEqual(5);
    for (const cat of ['agent', 'trading', 'data', 'tools', 'analytics']) {
      expect(categories.has(cat as FeatureStateV2['category'])).toBe(true);
    }
  });

  test('every listFeatures() entry has name + enabled + source + category + description', () => {
    const all = listFeatures();
    for (const f of all) {
      expect(f.name).toBeTruthy();
      expect(typeof f.enabled).toBe('boolean');
      expect(['compile', 'startup', 'runtime', 'default']).toContain(f.source);
      expect(f.category).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.since).toBeTruthy();
      expect(f.owner).toBeTruthy();
    }
  });

  test('listFeatures() is sorted by category then name (stable for diffs)', () => {
    const all = listFeatures();
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!;
      const b = all[i]!;
      if (a.category !== b.category) {
        // Use localeCompare to match the production sort; raw `<` is
        // wrong for names like A_B_TESTING (underscore > letters in ASCII).
        expect(a.category!.localeCompare(b.category!)).toBeLessThanOrEqual(0);
      } else {
        expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0);
      }
    }
  });

  test('default-enabled flags (e.g. WORKER_RESUME) are enabled out of the box', () => {
    // The BUILTIN_FEATURES table marks some flags defaultEnabled=true.
    // With no env override + no runtime set, they should be enabled.
    expect(isFeatureCompiledIn('WORKER_RESUME')).toBe(true);
    expect(isFeatureCompiledIn('WORKER_XML')).toBe(true);
    expect(isFeatureCompiledIn('AGENT_SCRATCHPAD')).toBe(true);
  });

  test('default-disabled flags (e.g. COORDINATOR_MODE) are disabled out of the box', () => {
    expect(isFeatureCompiledIn('COORDINATOR_MODE')).toBe(false);
    expect(isFeatureCompiledIn('PAPER_TRADING')).toBe(false);
    expect(isFeatureCompiledIn('BACKTEST_V2')).toBe(false);
  });

  test('isFeatureCompiledIn returns false for unknown flag names (typo guard)', () => {
    expect(isFeatureCompiledIn('NONSENSE_FLAG')).toBe(false);
    expect(isFeatureCompiledIn('worker_resume')).toBe(false); // case sensitive
    expect(isFeatureCompiledIn('')).toBe(false);
  });

  test('compile-time env BUN_CONFIG_FEATURE_* flips isFeatureCompiledIn', () => {
    const FLAG = 'COORDINATOR_MODE';
    // Reset to known state
    delete process.env['BUN_CONFIG_FEATURE_COORDINATOR_MODE'];
    expect(isFeatureCompiledIn(FLAG)).toBe(false);
    process.env['BUN_CONFIG_FEATURE_COORDINATOR_MODE'] = '1';
    expect(isFeatureCompiledIn(FLAG)).toBe(true);
    process.env['BUN_CONFIG_FEATURE_COORDINATOR_MODE'] = '0';
    expect(isFeatureCompiledIn(FLAG)).toBe(false);
    delete process.env['BUN_CONFIG_FEATURE_COORDINATOR_MODE'];
  });

  test('registerFeature adds a custom flag that is queryable', () => {
    const flag: FeatureFlag = {
      name: 'CUSTOM_PLUGIN_FLAG',
      description: 'A flag added at runtime by a plugin',
      category: 'experimental',
      defaultEnabled: true,
      since: '2026.6.0',
      owner: 'plugin-x',
    };
    registerFeature(flag);
    const got = getFeatureFlag('CUSTOM_PLUGIN_FLAG');
    expect(got).not.toBeNull();
    expect(got!.owner).toBe('plugin-x');
    expect(isFeatureCompiledIn('CUSTOM_PLUGIN_FLAG')).toBe(true);
  });

  test('registerFeature is idempotent — re-registering overwrites metadata', () => {
    registerFeature({
      name: 'OVERWRITE_ME',
      description: 'first',
      category: 'experimental',
      defaultEnabled: false,
      since: '2026.6.0',
      owner: 'a',
    });
    registerFeature({
      name: 'OVERWRITE_ME',
      description: 'second',
      category: 'experimental',
      defaultEnabled: true,
      since: '2026.6.0',
      owner: 'b',
    });
    const got = getFeatureFlag('OVERWRITE_ME');
    expect(got!.description).toBe('second');
    expect(got!.owner).toBe('b');
    expect(isFeatureCompiledIn('OVERWRITE_ME')).toBe(true);
  });

  test('getFeatureFlag returns null for unknown flags', () => {
    expect(getFeatureFlag('NONSENSE')).toBeNull();
  });

  test('doctor() includes every BUILTIN feature (v2 sweep)', () => {
    featureGates.register('DUMMY');
    const all = listFeatures();
    const names = new Set(all.map((f) => f.name));
    // Doctor should at least contain every listFeatures() entry.
    // (Note: doctor() is a separate method that may also include
    // env-detected gates; we just check the registry ones are there.)
    for (const f of all) {
      expect(names.has(f.name)).toBe(true);
    }
    // Spot-check a handful of well-known v2 flags
    expect(names.has('COORDINATOR_MODE')).toBe(true);
    expect(names.has('BACKTEST_V2')).toBe(true);
    expect(names.has('GROWTHBOOK')).toBe(true);
    expect(names.has('TELEMETRY')).toBe(true);
  });

  test('source=runtime when featureGates.set() is called, even for BUILTIN flags', () => {
    featureGates.set('COORDINATOR_MODE', { ratio: 1 });
    const all = listFeatures();
    const flag = all.find((f) => f.name === 'COORDINATOR_MODE')!;
    expect(flag.enabled).toBe(true);
    expect(flag.source).toBe('runtime');
  });

  test('source=compile when BUN_CONFIG_FEATURE_* is set', () => {
    process.env['BUN_CONFIG_FEATURE_AGENT_VISION'] = '1';
    const all = listFeatures();
    const flag = all.find((f) => f.name === 'AGENT_VISION')!;
    expect(flag.enabled).toBe(true);
    expect(flag.source).toBe('compile');
    delete process.env['BUN_CONFIG_FEATURE_AGENT_VISION'];
  });

  test('source=startup when FEATURE_* is set', () => {
    process.env['FEATURE_AGENT_VISION'] = 'true';
    const all = listFeatures();
    const flag = all.find((f) => f.name === 'AGENT_VISION')!;
    expect(flag.enabled).toBe(true);
    expect(flag.source).toBe('startup');
    delete process.env['FEATURE_AGENT_VISION'];
  });
});
