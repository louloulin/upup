import { describe, expect, test } from 'bun:test';
import { createFinanceComposition } from './src/index.js';

describe('@upup/pi-finance-composition', () => {
  test('creates injected finance services without contacting providers', async () => {
    const composition = createFinanceComposition({ sessionId: 'finance-test', marketQuoteFetcher: async () => new Response('{}') });
    expect(composition.getInvestmentWorkflowServices()).toHaveProperty('getResearchData');
    expect(composition.trendStore).toBeDefined();
  });
});
