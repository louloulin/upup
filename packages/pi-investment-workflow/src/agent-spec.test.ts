import { describe, expect, test } from 'bun:test';
import { agentDefinitionToPiSpec, getInvestmentAgentSpec, serializeAgentSpec, subagentConfigToPiSpec, validateAgentSpec } from './agent-spec.js';

describe('Pi investment agent specs', () => {
  test('serializes a versioned investment profile', () => {
    const spec = getInvestmentAgentSpec('invest-explore');
    expect(JSON.parse(serializeAgentSpec(spec))).toMatchObject({
      id: 'invest-explore',
      version: '1.0.0',
      skills: ['finance-evidence', 'financial-research', 'fundamental-analysis', 'market-data'],
      permissions: { allowFinancialWrites: false },
    });
  });

  test('rejects invalid versions and empty tool declarations', () => {
    const spec = getInvestmentAgentSpec('invest-plan');
    expect(() => validateAgentSpec({ ...spec, version: '1' })).toThrow();
    expect(() => validateAgentSpec({ ...spec, tools: [] })).toThrow();
  });

  test('validates explicit Pi Package allowlists', () => {
    const spec = getInvestmentAgentSpec('invest-explore');
    validateAgentSpec({ ...spec, packages: ['@upup/pi-finance-sdk'] });
    expect(() => validateAgentSpec({ ...spec, packages: ['@upup/pi-finance-sdk', '@upup/pi-finance-sdk'] })).toThrow('duplicate');
    expect(() => validateAgentSpec({ ...spec, packages: ['../untrusted'] })).toThrow('invalid Pi package name');
  });

  test('converts legacy registry metadata into an executable Pi spec', () => {
    const spec = agentDefinitionToPiSpec({
      id: 'legacy-research',
      name: 'Legacy Research',
      description: 'Compatibility metadata',
      capabilities: ['research'],
      taskTypes: ['research'],
      config: { tools: ['fixture_market_quote'] },
    });
    expect(spec.tools).toEqual(['fixture_market_quote']);
    expect(spec.permissions.id).toBe('read-only');
    expect(spec.mode).toBe('subagent');
  });

  test('preserves custom Agent permissions and workflow metadata at the Pi boundary', () => {
    const spec = agentDefinitionToPiSpec({
      id: 'trade-worker',
      name: 'Trade Worker',
      description: 'Sandbox trade planner',
      mode: 'worker',
      workflow: 'invest',
      dataPolicy: 'offline',
      outputContract: 'json',
      timeoutMs: 1000,
      permissions: {
        id: 'sandbox-trade',
        allow: ['safe', 'warning', 'dangerous'],
        requireApproval: ['dangerous'],
        deny: ['critical'],
        allowExternalNetwork: false,
        allowCredentialAccess: false,
        allowFinancialWrites: false,
      },
    });
    expect(spec).toMatchObject({
      mode: 'worker',
      workflow: 'invest',
      dataPolicy: 'offline',
      outputContract: 'json',
      timeoutMs: 1000,
      permissions: { id: 'sandbox-trade', allowExternalNetwork: false },
    });
  });

  test('preserves legacy investment allowlists without widening them to all tools', () => {
    const spec = agentDefinitionToPiSpec({
      id: 'invest-explore',
      name: 'Investment Explore',
      description: 'Read-only investment research',
      config: { toolWhitelist: ['financial_metrics', 'web_search'] },
    });
    expect(spec.tools).toEqual(['financial_metrics', 'web_search']);
  });

  test('converts every subagent boundary into a complete Pi spec', () => {
    const spec = subagentConfigToPiSpec({
      id: 'risk-worker',
      name: 'Risk Worker',
      type: 'specialized',
      tools: ['calculate_var'],
      skills: ['risk-management'],
      packages: ['@upup/pi-finance-sdk'],
      capabilities: ['risk'],
      taskTypes: ['stress-test'],
      workflow: 'invest',
      timeoutMs: 5000,
    });
    expect(spec).toMatchObject({
      id: 'risk-worker',
      mode: 'worker',
      tools: ['calculate_var'],
      skills: ['risk-management'],
      packages: ['@upup/pi-finance-sdk'],
      workflow: 'invest',
      permissions: { deny: ['critical'], requireApproval: ['dangerous'] },
      timeoutMs: 5000,
    });
    validateAgentSpec(spec);
  });

  test('preserves Package allowlists from custom Agent definitions', () => {
    const spec = agentDefinitionToPiSpec({
      id: 'package-worker',
      name: 'Package Worker',
      description: 'Uses a declared Pi Package',
      packages: ['@upup/pi-finance-sdk'],
      config: { packages: ['@upup/ignored-by-explicit-field'] },
    });
    expect(spec.packages).toEqual(['@upup/pi-finance-sdk']);
  });
});
