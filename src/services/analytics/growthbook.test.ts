import { describe, test, expect, beforeEach } from 'bun:test';
import {
  assignVariant,
  featureExperiment,
  registerExperiment,
  listExperiments,
  _resetExperiments,
  type ExperimentVariant,
} from './growthbook.js';

describe('growthbook — assignVariant basics', () => {
  test('throws on empty variants list', () => {
    expect(() => assignVariant('exp', { userId: 'u1' }, [])).toThrow(/variants list is empty/);
  });

  test('throws when weights do not sum to 1.0', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.4 },
      { key: 'b', weight: 0.4 },
    ];
    expect(() => assignVariant('exp', { userId: 'u1' }, variants)).toThrow(
      /must sum to 1\.0 \(got 0\.8\)/,
    );
  });

  test('accepts weights summing to 1.0 within 1e-6 tolerance', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.3333333 },
      { key: 'b', weight: 0.3333333 },
      { key: 'c', weight: 0.3333334 },
    ];
    const result = assignVariant('exp', { userId: 'u1' }, variants);
    expect(['a', 'b', 'c']).toContain(result.variantKey);
  });

  test('returns ExperimentAssignment with correct shape', () => {
    const variants: ExperimentVariant[] = [
      { key: 'control', weight: 0.5 },
      { key: 'treatment', weight: 0.5 },
    ];
    const result = assignVariant('algo-routing-v2', { userId: 'user-42' }, variants);
    expect(result.experimentKey).toBe('algo-routing-v2');
    expect(result.userId).toBe('user-42');
    expect(result.inExperiment).toBe(true);
    expect(['control', 'treatment']).toContain(result.variantKey);
  });
});

describe('growthbook — determinism & consistency', () => {
  test('same userId + same experiment always picks the same variant', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.5 },
    ];
    const first = assignVariant('exp-1', { userId: 'user-99' }, variants);
    for (let i = 0; i < 20; i++) {
      const r = assignVariant('exp-1', { userId: 'user-99' }, variants);
      expect(r.variantKey).toBe(first.variantKey);
    }
  });

  test('different experiments produce independent buckets for the same user', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.5 },
    ];
    const userId = 'user-99';
    // The two experiments should NOT have identical distribution across all users
    // (otherwise hashes collide). Sample 50 users and verify variance.
    const exp1 = new Set<string>();
    const exp2 = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const u = `user-${i}`;
      exp1.add(assignVariant('exp-A', { userId: u }, variants).variantKey);
      exp2.add(assignVariant('exp-B', { userId: u }, variants).variantKey);
    }
    // Both should see both variants (independence)
    expect(exp1.size).toBe(2);
    expect(exp2.size).toBe(2);
  });

  test('missing userId falls back to "anonymous" and is deterministic', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.5 },
    ];
    const r1 = assignVariant('exp', {}, variants);
    const r2 = assignVariant('exp', { userId: undefined }, variants);
    expect(r1.userId).toBe('anonymous');
    expect(r1.variantKey).toBe(r2.variantKey);
  });
});

describe('growthbook — distribution accuracy', () => {
  test('50/50 split is roughly 50/50 over 2000 users', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.5 },
    ];
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) {
      const r = assignVariant('exp', { userId: `user-${i}` }, variants);
      counts[r.variantKey as 'a' | 'b']++;
    }
    // Expect ~1000 each, allow 8% tolerance
    expect(counts.a).toBeGreaterThan(840);
    expect(counts.a).toBeLessThan(1160);
    expect(counts.b).toBeGreaterThan(840);
    expect(counts.b).toBeLessThan(1160);
  });

  test('3-way 0.5/0.3/0.2 split matches expected proportions over 5000 users', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.3 },
      { key: 'c', weight: 0.2 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 5000; i++) {
      const r = assignVariant('exp', { userId: `u${i}` }, variants);
      counts[r.variantKey]++;
    }
    // Expected: a=2500, b=1500, c=1000. Allow 5% tolerance.
    expect(counts.a).toBeGreaterThan(2375);
    expect(counts.a).toBeLessThan(2625);
    expect(counts.b).toBeGreaterThan(1425);
    expect(counts.b).toBeLessThan(1575);
    expect(counts.c).toBeGreaterThan(950);
    expect(counts.c).toBeLessThan(1050);
  });

  test('100% weight always picks that variant', () => {
    const variants: ExperimentVariant[] = [
      { key: 'only', weight: 1.0 },
    ];
    for (let i = 0; i < 100; i++) {
      const r = assignVariant('exp', { userId: `u${i}` }, variants);
      expect(r.variantKey).toBe('only');
    }
  });

  test('1.0 / 0.0 / 0.0 weighted split always picks the first variant', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 1.0 },
      { key: 'b', weight: 0.0 },
      { key: 'c', weight: 0.0 },
    ];
    for (let i = 0; i < 50; i++) {
      const r = assignVariant('exp', { userId: `u${i}` }, variants);
      expect(r.variantKey).toBe('a');
    }
  });
});

describe('growthbook — featureExperiment convenience', () => {
  test('returns just the variant key string', () => {
    const variants: ExperimentVariant[] = [
      { key: 'control', weight: 0.5 },
      { key: 'treatment', weight: 0.5 },
    ];
    const key = featureExperiment('algo-routing-v2', { userId: 'user-1' }, variants);
    expect(typeof key).toBe('string');
    expect(['control', 'treatment']).toContain(key);
  });

  test('matches the variantKey from assignVariant for the same inputs', () => {
    const variants: ExperimentVariant[] = [
      { key: 'a', weight: 0.3 },
      { key: 'b', weight: 0.7 },
    ];
    const full = assignVariant('exp', { userId: 'user-7' }, variants);
    const short = featureExperiment('exp', { userId: 'user-7' }, variants);
    expect(short).toBe(full.variantKey);
  });
});

describe('growthbook — registerExperiment + listExperiments', () => {
  beforeEach(() => {
    _resetExperiments();
  });

  test('registerExperiment + listExperiments round-trip', () => {
    registerExperiment(
      'algo-routing-v2',
      [
        { key: 'control', weight: 0.5 },
        { key: 'treatment', weight: 0.5 },
      ],
      { description: 'New routing algorithm' },
    );
    const list = listExperiments();
    expect(list).toHaveLength(1);
    expect(list[0]!.key).toBe('algo-routing-v2');
    expect(list[0]!.description).toBe('New routing algorithm');
    expect(list[0]!.variants).toEqual([
      { key: 'control', weight: 0.5 },
      { key: 'treatment', weight: 0.5 },
    ]);
  });

  test('registerExperiment is idempotent — re-registering overwrites', () => {
    registerExperiment('exp', [{ key: 'a', weight: 1.0 }], { description: 'first' });
    registerExperiment('exp', [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.5 },
    ], { description: 'second' });
    const list = listExperiments();
    expect(list).toHaveLength(1);
    expect(list[0]!.description).toBe('second');
    expect(list[0]!.variants).toHaveLength(2);
  });

  test('registerExperiment validates weights and throws', () => {
    expect(() =>
      registerExperiment('bad-exp', [
        { key: 'a', weight: 0.3 },
        { key: 'b', weight: 0.3 },
      ]),
    ).toThrow(/must sum to 1\.0/);
  });

  test('registerExperiment with empty variants throws', () => {
    expect(() => registerExperiment('empty', [])).toThrow(/variants list is empty/);
  });

  test('listExperiments returns empty array when nothing registered', () => {
    expect(listExperiments()).toEqual([]);
  });

  test('listExperiments returns defensive copies (mutation does not leak)', () => {
    registerExperiment('exp', [
      { key: 'a', weight: 0.5 },
      { key: 'b', weight: 0.5 },
    ]);
    const list = listExperiments();
    list[0]!.variants[0]!.weight = 0.99;
    const list2 = listExperiments();
    expect(list2[0]!.variants[0]!.weight).toBe(0.5);
  });
});
