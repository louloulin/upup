import { describe, expect, test } from 'bun:test';
import { getToolRegistry } from '../../tools/registry/index.js';
import { getInvestmentAgentSpec, INVESTMENT_PROFILES } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';

describe('Pi investment profiles against the production registry', () => {
  test('every explicit profile tool is registered and no profile names a removed tool', async () => {
    const registered = new Set((await getToolRegistry('deepseek-v4-flash')).map((tool) => tool.name));
    for (const spec of Object.values(INVESTMENT_PROFILES)) {
      expect(spec.tools).not.toBe('*');
      for (const toolName of spec.tools) expect(registered.has(toolName)).toBe(true);
    }
    expect(registered.has('web_search')).toBe(false);
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
    const fixture = await import('../../extensions/upup/finance-fixtures.js');
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
