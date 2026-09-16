import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from 'typebox';
import { getInvestmentAgentSpec, INVESTMENT_PROFILES } from '@upup/pi-investment-workflow';
import { PiAgentSessionFactory } from '@upup/pi-session';
import type { FinancialToolDetails, UpUpToolContract } from '@upup/pi-runtime';

/**
 * Local injected contracts: the finance packages no longer export probe tools
 * (they read real providers), so the surface this test injects is defined here.
 */
function probeTool(name: string, category: 'market' | 'finance'): UpUpToolContract {
  return {
    name,
    label: name,
    description: `Session probe tool ${name}.`,
    category,
    safetyLevel: 'safe',
    parameters: Type.Object({ symbol: Type.String({ minLength: 1 }) }),
    maxConcurrent: 4,
    hasFinancialImpact: false,
    async execute(input: { symbol: string }): Promise<{ value: { symbol: string }; text: string; details: FinancialToolDetails }> {
      const value = { symbol: input.symbol };
      return {
        value,
        text: JSON.stringify(value),
        details: {
          evidence: [{ id: `probe-${name}`, source: 'upup-probe://profile-contract', retrievedAt: '2026-01-01T00:00:00.000Z', asOf: '2026-01-01', query: input.symbol }],
          dataFreshness: 'historical',
          warnings: ['Session probe; not market data.'],
          auditId: `probe-${name}`,
        },
      };
    },
  };
}

const PROBE_TOOLS: readonly UpUpToolContract[] = [probeTool('probe_quote', 'market'), probeTool('probe_fundamentals', 'finance')];

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

  test('tests can explicitly inject a probe tool surface without widening production profiles', async () => {
    const spec = { ...getInvestmentAgentSpec('invest-explore'), tools: PROBE_TOOLS.map((tool) => tool.name) };
    const session = await new PiAgentSessionFactory().createSession(spec, {
      cwd: process.cwd(),
      tools: PROBE_TOOLS,
    });
    try {
      expect(session.getAvailableToolNames()).toEqual(PROBE_TOOLS.map((tool) => tool.name));
    } finally {
      session.dispose();
    }
  });
});
