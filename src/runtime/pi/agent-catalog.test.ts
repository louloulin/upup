import { describe, expect, test } from 'bun:test';
import { createPiAgentCatalog } from './agent-catalog.js';
import { getInvestmentAgentSpec } from './agent-spec.js';

describe('PiAgentCatalog', () => {
  test('stores and selects executable Pi specs without a second runtime definition', () => {
    const catalog = createPiAgentCatalog([
      getInvestmentAgentSpec('invest-explore'),
      getInvestmentAgentSpec('invest-risk'),
    ], 'invest-explore');

    expect(catalog.get('invest-explore')?.spec.tools).toContain('get_market_data');
    expect(catalog.select('portfolio stress test').spec.id).toBe('invest-risk');
    expect(catalog.getDefault().spec.id).toBe('invest-explore');
    expect(catalog.getAll().every((record) => record.spec.permissions)).toBe(true);
  });

  test('does not remove built-in specs without force', () => {
    const catalog = createPiAgentCatalog([getInvestmentAgentSpec('invest-explore')]);
    expect(catalog.unregister('invest-explore')).toBe(false);
    expect(catalog.unregister('invest-explore', true)).toBe(true);
  });
});
