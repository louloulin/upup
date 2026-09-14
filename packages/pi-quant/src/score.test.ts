import { describe, expect, test } from 'bun:test';
import { combineFactors, scoreUniverse, equalWeightWeights } from './score.js';

describe('combineFactors', () => {
  test('weighted sum with positive weight', () => {
    const factors = new Map([['mom', 0.1], ['val', 0.05]]);
    const weights = [
      { factorId: 'mom', weight: 0.6 },
      { factorId: 'val', weight: 0.4 },
    ];
    const out = combineFactors(factors, weights);
    expect(out.rawScore).toBeCloseTo(0.6 * 0.1 + 0.4 * 0.05, 8);
  });
  test('skips missing factors', () => {
    const factors = new Map([['mom', 0.1]]);
    const weights = [
      { factorId: 'mom', weight: 0.5 },
      { factorId: 'val', weight: 0.5 },
    ];
    const out = combineFactors(factors, weights);
    expect(out.rawScore).toBeCloseTo(0.05, 8);
  });
  test('negative weight flips direction', () => {
    const factors = new Map([['vol', 0.2]]);
    const weights = [{ factorId: 'vol', weight: -1.0 }];
    const out = combineFactors(factors, weights);
    expect(out.rawScore).toBeCloseTo(-0.2, 8);
  });
});

describe('equalWeightWeights', () => {
  test('divides weight equally', () => {
    const w = equalWeightWeights(['a', 'b', 'c', 'd']);
    expect(w.length).toBe(4);
    expect(w[0].weight).toBeCloseTo(0.25, 8);
  });
});

describe('scoreUniverse', () => {
  test('ranks symbols by combined score', () => {
    const matrix = new Map<string, ReadonlyMap<string, number>>();
    matrix.set('A', new Map([['mom', 0.10], ['val', 0.05]]));
    matrix.set('B', new Map([['mom', 0.05], ['val', 0.02]]));
    matrix.set('C', new Map([['mom', -0.10], ['val', -0.05]]));
    const weights = [{ factorId: 'mom', weight: 0.5 }, { factorId: 'val', weight: 0.5 }];
    const scores = scoreUniverse(['A', 'B', 'C'], matrix, weights, '2024-01-01');
    expect(scores.length).toBe(3);
    const top = scores[0];
    const bottom = scores[scores.length - 1];
    expect(top.symbol).toBe('A');
    expect(bottom.symbol).toBe('C');
    expect(top.rank).toBe(1);
  });
});
