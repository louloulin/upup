import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { getInvestmentAgentSpec } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';

describe('Pi investment workflow package integration', () => {
  test('loads the trusted workflow package and executes a market backtest in a real Session', async () => {
    const packageRoot = join(process.cwd(), 'packages');
    const packageNames = [
      '@upup/pi-investment-workflow',
      '@upup/pi-backtest',
      '@upup/pi-investment-analysis',
      '@upup/pi-portfolio',
      '@upup/pi-market-data',
      '@upup/pi-research',
      '@upup/pi-finance-sdk',
      '@upup/pi-risk',
    ];
    const packageDirectories = ['pi-investment-workflow', 'pi-backtest', 'pi-investment-analysis', 'pi-portfolio', 'pi-market-data', 'pi-research', 'pi-finance-sdk', 'pi-risk'];
    const trust = {
      trustedPaths: packageDirectories.map((directory) => join(packageRoot, directory)),
      pinnedPackages: { ...Object.fromEntries(packageNames.map((name) => [name, '0.1.0'])), '@upup/pi-storage': '0.2.0', '@upup/pi-planning': '0.1.0', '@upup/pi-research': '0.1.0', '@upup/pi-market-data': '0.1.0', '@upup/memory': '0.2.0', '@upup/pi-finance-sdk': '0.1.0', '@earendil-works/pi-coding-agent': '0.84.3', typebox: '1.3.7' } as Record<string, string>,
      allowedSources: Object.fromEntries(packageNames.map((name) => [name, ['builtin:upup']])) as Record<string, readonly string[]>,
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-plan'),
      packages: packageNames,
      skills: [],
      tools: ['invest_workflow_phase'],
    }, {
      cwd: process.cwd(),
      piPackagePaths: trust.trustedPaths,
      piPackageTrust: trust,
      marketHistoryFetcher: async (input) => {
        expect(String(input)).toContain('AAPL');
        const timestamps = [Date.parse('2026-01-02T00:00:00Z') / 1000, Date.parse('2026-01-05T00:00:00Z') / 1000];
        return new Response(JSON.stringify({ chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1100] }], adjclose: [{ adjclose: [100.5, 101.5] }] } }] } }), { status: 200 });
      },
    });
    try {
      expect(session.getAvailableToolNames()).toContain('invest_workflow_phase');
      const result = await session.executeTool('invest_workflow_phase', 'workflow-market-execute', { phase: 'execute', ticker: 'AAPL', goal: '回测策略' });
      expect((result as { isError?: boolean }).isError).not.toBe(true);
      expect((result.content[0] as { type: string; text?: string }).text).toContain('Market Analysis');
      expect(result.details).toMatchObject({ auditId: 'workflow-market-execute', evidence: [expect.objectContaining({ phase: 'execute' })] });
    } finally {
      session.dispose();
    }
  });
});
