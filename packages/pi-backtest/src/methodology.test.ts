import { describe, expect, test } from 'bun:test';
import { validateMethodology, type MethodologyDisclosure } from './methodology.js';

const complete: MethodologyDisclosure = {
  factorSources: [{ name: 'PE-TTM', source: 'market-data', description: '反向估值因子' }],
  lookAheadBiasCheck: 'pass',
  walkForward: {
    trainWindowDays: 252,
    testWindowDays: 63,
    folds: [
      { trainStartDate: '2020-01-01', trainEndDate: '2020-12-31', testStartDate: '2021-01-01', testEndDate: '2021-03-31', oosReturnPct: 0.05 },
      { trainStartDate: '2021-01-01', trainEndDate: '2021-12-31', testStartDate: '2022-01-01', testEndDate: '2022-03-31', oosReturnPct: 0.02 },
      { trainStartDate: '2022-01-01', trainEndDate: '2022-12-31', testStartDate: '2023-01-01', testEndDate: '2023-03-31', oosReturnPct: -0.01 },
    ],
  },
  outOfSample: { startDate: '2023-04-01', endDate: '2024-12-31', totalReturnPct: 0.1, tradeCount: 12 },
};

describe('Pi backtest methodology contract', () => {
  test('accepts a complete disclosure', () => {
    expect(validateMethodology(complete)).toEqual({ ok: true, missing: [] });
  });

  test('reports missing disclosures and look-ahead failure', () => {
    const result = validateMethodology({ ...complete, factorSources: [], lookAheadBiasCheck: 'fail', walkForward: { ...complete.walkForward, folds: [] }, outOfSample: undefined as never });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['factorSources', 'lookAheadBiasCheck=fail (look-ahead bias detected)', 'walkForward.folds (need >= 3)', 'outOfSample']));
  });
});
