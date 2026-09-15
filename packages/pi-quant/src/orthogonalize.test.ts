import { describe, expect, test } from 'bun:test';
import { regress, orthogonalize, neutralizeIndustryMomentum } from './orthogonalize';

describe('regress', () => {
  test('simple linear regression recovers slope and intercept', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [3, 5, 7, 9, 11];
    const result = regress(y, [x]);
    expect(result.intercept).toBeCloseTo(1.0, 5);
    expect(result.coefficients[0]).toBeCloseTo(2.0, 5);
  });
  test('multiple regression', () => {
    const x1 = [1, 2, 3, 4, 5];
    const x2 = [2, 1, 4, 3, 5];
    const y = x1.map((v, i) => 1 + 2 * v + 0.5 * x2[i]);
    const result = regress(y, [x1, x2]);
    expect(result.intercept).toBeCloseTo(1, 5);
    expect(result.coefficients[0]).toBeCloseTo(2, 5);
    expect(result.coefficients[1]).toBeCloseTo(0.5, 5);
  });
  test('rSquared close to 1 for perfect fit', () => {
    const x = [1, 2, 3, 4, 5];
    const y = x.map((v) => v * 3);
    const result = regress(y, [x]);
    expect(result.rSquared).toBeCloseTo(1, 5);
  });
  test('handles empty X', () => {
    const result = regress([1, 2, 3], []);
    expect(result.coefficients.length).toBe(0);
    expect(result.intercept).toBe(2);
  });
  test('handles n=1', () => {
    const result = regress([5], [[1]]);
    expect(result.fitted[0]).toBe(5);
  });
});

describe('orthogonalize', () => {
  test('removes linear dependence on reference', () => {
    const ref = [1, 2, 3, 4, 5];
    const target = ref.map((v) => v * 3 + 7);
    const residuals = orthogonalize(target, [ref]);
    expect(Math.abs(meanOf(residuals))).toBeLessThan(1e-6);
  });
});

describe('neutralizeIndustryMomentum', () => {
  test('produces residuals of length equal to input', () => {
    const residuals = neutralizeIndustryMomentum([1, 2, 3, 4, 5], [[1.1, 2.1, 2.9, 4.1, 5.1]]);
    expect(residuals.length).toBe(5);
  });
});

function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
