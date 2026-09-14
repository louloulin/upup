import { describe, expect, test } from 'bun:test';
import { FINANCE_FIXTURE_TOOLS } from './finance-fixtures.js';
import type { UpUpAgentSpec } from '@upup/pi-runtime';

const UPUP_INVESTMENT_EXTENSION = {
  agents: [{} as UpUpAgentSpec],
};

function validateExtensionManifest(manifest: typeof UPUP_INVESTMENT_EXTENSION): void {
  if (manifest.agents.length === 0) throw new Error('fixture extension requires an agent profile');
}

describe('UpUp Pi investment extension', () => {
  test('publishes five deterministic finance adapter tools', () => {
    validateExtensionManifest(UPUP_INVESTMENT_EXTENSION);
    expect(FINANCE_FIXTURE_TOOLS.map((tool) => tool.name)).toEqual([
      'fixture_market_quote',
      'fixture_fundamentals',
      'fixture_news',
      'fixture_search',
      'fixture_trading_day',
    ]);
  });

  test('returns evidence and audit metadata without credentials', async () => {
    const tool = FINANCE_FIXTURE_TOOLS[0];
    const result = await tool.execute({ symbol: '600519.SH' }, {
      agent: UPUP_INVESTMENT_EXTENSION.agents[0],
      toolCallId: 'call-1',
      signal: new AbortController().signal,
      auditId: 'outer-audit',
    });
    expect(result.details?.evidence[0]).toMatchObject({
      source: 'upup-fixture://market-quote',
      retrievedAt: '2026-09-13T00:00:00.000Z',
      asOf: '2026-09-12',
      dataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(result.details?.warnings).toHaveLength(1);
    expect(result.details?.auditId).toContain('fixture-audit-market-quote');
    expect(JSON.stringify(result)).not.toContain('API_KEY');
  });
});
