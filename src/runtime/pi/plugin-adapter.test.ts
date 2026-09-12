import { describe, expect, test } from 'bun:test';
import { Type } from 'typebox';
import type { LoadedPlugin } from '../../plugins/types.js';
import { getInvestmentAgentSpec } from './agent-spec.js';
import { PiAgentSessionFactory } from './agent-session-factory.js';

describe('Pi plugin bridge', () => {
  test('loads a trusted plugin tool into Pi AgentSession', async () => {
    const calls: unknown[] = [];
    const plugin: LoadedPlugin = {
      id: 'finance-fixture-plugin',
      runtime: 'bun',
      manifest: {
        schemaVersion: '1.0',
        id: 'finance-fixture-plugin',
        name: 'Finance Fixture Plugin',
        version: '1.0.0',
        runtime: 'bun',
        capabilities: ['tools', 'skill'],
        entry: 'index.ts',
        skills: [{ name: 'fixture-analysis', description: 'Fixture skill', instructions: 'Use the fixture quote tool.' }],
      },
      instance: {},
      services: [],
      hooks: new Map(),
      tools: [{
        name: 'plugin_fixture_quote',
        description: 'Returns a plugin fixture quote.',
        schema: Type.Object({ symbol: Type.String() }),
        async execute(input) {
          calls.push(input);
          return { symbol: input.symbol, close: 100 };
        },
      }],
    };
    const session = await new PiAgentSessionFactory().createSession({
      ...getInvestmentAgentSpec('invest-explore'),
      tools: '*',
    }, {
      cwd: process.cwd(),
      piPlugins: [{ plugin, path: process.cwd() }],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { upup: '2026.6.12' } },
    });
    expect(session.getAvailableToolNames()).toContain('plugin_fixture_quote');
    expect(session.getResourceTrustAudit().some((audit) => audit.path === process.cwd())).toBe(true);
    session.dispose();
    expect(calls).toEqual([]);
  });

  test('rejects plugin loading without an explicit trust policy', async () => {
    const plugin = {
      id: 'untrusted',
      runtime: 'bun' as const,
      manifest: { schemaVersion: '1.0', id: 'untrusted', name: 'Untrusted', version: '1.0.0', runtime: 'bun' as const, capabilities: ['tools' as const], entry: 'index.ts' },
      instance: {}, services: [], tools: [], hooks: new Map(),
    } satisfies LoadedPlugin;
    await expect(new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      piPlugins: [{ plugin, path: process.cwd() }],
    })).rejects.toThrow('trustedPaths');
  });

  test('filters trusted plugin tools through the profile allowlist', async () => {
    const plugin: LoadedPlugin = {
      id: 'filtered-plugin', runtime: 'bun', manifest: { schemaVersion: '1.0', id: 'filtered-plugin', name: 'Filtered', version: '1.0.0', runtime: 'bun', capabilities: ['tools'], entry: 'index.ts' }, instance: {}, services: [], hooks: new Map(),
      tools: [
        { name: 'fixture_market_quote', description: 'allowed', async execute() { return 'ok'; } },
        { name: 'plugin_secret_tool', description: 'not allowlisted', async execute() { return 'secret'; } },
      ],
    };
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-plan'), tools: ['fixture_market_quote'] }, {
      cwd: process.cwd(),
      piPlugins: [{ plugin, path: process.cwd() }],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { upup: '2026.6.12' } },
    });
    expect(session.getAvailableToolNames()).toContain('fixture_market_quote');
    expect(session.getAvailableToolNames()).not.toContain('plugin_secret_tool');
    session.dispose();
  });

  test('returns auditable evidence and redacts plugin credentials', async () => {
    const plugin: LoadedPlugin = {
      id: 'evidence-plugin', runtime: 'bun',
      manifest: { schemaVersion: '1.0', id: 'evidence-plugin', name: 'Evidence', version: '1.0.0', runtime: 'bun', capabilities: ['tools'], entry: 'index.ts' },
      instance: {}, services: [], hooks: new Map(),
      tools: [{
        name: 'plugin_evidence_quote', description: 'quote', schema: Type.Object({ symbol: Type.String() }),
        async execute() {
          return { close: 100, sourceUrls: ['https://example.test/quote?api_key=SECRET'], token: 'SECRET' };
        },
      }],
    };
    const session = await new PiAgentSessionFactory().createSession({ ...getInvestmentAgentSpec('invest-explore'), tools: '*' }, {
      cwd: process.cwd(),
      piPlugins: [{ plugin, path: process.cwd() }],
      pluginTrust: { trustedPaths: [process.cwd()], pinnedPackages: { upup: '2026.6.12' } },
    });
    const tool = session.getAvailableToolNames().find((name) => name === 'plugin_evidence_quote');
    expect(tool).toBe('plugin_evidence_quote');
    session.dispose();
  });
});
