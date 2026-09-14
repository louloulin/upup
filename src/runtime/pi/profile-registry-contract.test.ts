import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getInvestmentAgentSpec, INVESTMENT_PROFILES } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';

const PACKAGE_NAMES = ['pi-investment-workflow', 'pi-finance-sdk', 'pi-market-data', 'pi-investment-analysis', 'pi-risk', 'pi-portfolio', 'pi-backtest', 'pi-platform', 'pi-research', 'pi-technical', 'pi-browser', 'pi-corporate-actions', 'pi-quant', 'pi-config', 'pi-cache', 'pi-notify', 'pi-management'];
const packageTools = new Map(PACKAGE_NAMES.map((name) => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'packages', name, 'package.json'), 'utf8')) as { pi?: { tools?: string[] } };
  return [name, manifest.pi?.tools ?? []] as const;
}));

describe('Pi investment profiles against native Package ownership', () => {
  test('every explicit profile tool is registered and no profile names a removed tool', async () => {
    for (const spec of Object.values(INVESTMENT_PROFILES)) {
      expect(spec.tools).not.toBe('*');
      for (const toolName of spec.tools) {
        expect([...packageTools.values()].some((tools) => tools.includes(toolName))).toBe(true);
      }
    }
  });

  test('each profile activates only its production allowlist through Pi', async () => {
    const factory = new PiAgentSessionFactory();
    for (const spec of Object.values(INVESTMENT_PROFILES)) {
      const session = await factory.createSession(spec, { cwd: process.cwd() });
      try {
        expect(session.getAvailableToolNames().every((name) => spec.tools !== '*' && spec.tools.includes(name))).toBe(true);
        expect(session.getAvailableToolNames().every((name) => name !== 'place_trade_order' || spec.id === 'invest-trade')).toBe(true);
      } finally {
        session.dispose();
      }
    }
  });

  test('fixture tests can explicitly inject a deterministic tool surface without widening production profiles', async () => {
    const fixture = await import('@upup/pi-finance-sdk/finance-fixtures');
    const spec = { ...getInvestmentAgentSpec('invest-explore'), tools: fixture.FINANCE_FIXTURE_TOOLS.map((tool) => tool.name) };
    const session = await new PiAgentSessionFactory().createSession(spec, {
      cwd: process.cwd(),
      tools: fixture.FINANCE_FIXTURE_TOOLS,
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(fixture.FINANCE_FIXTURE_TOOLS.map((tool) => tool.name));
    } finally {
      session.dispose();
    }
  });
});
