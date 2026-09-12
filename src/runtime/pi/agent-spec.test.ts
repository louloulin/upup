import { describe, expect, test } from 'bun:test';
import { agentDefinitionToPiSpec, getInvestmentAgentSpec, serializeAgentSpec, validateAgentSpec } from './agent-spec.js';

describe('Pi investment agent specs', () => {
  test('serializes a versioned investment profile', () => {
    const spec = getInvestmentAgentSpec('invest-explore');
    expect(JSON.parse(serializeAgentSpec(spec))).toMatchObject({
      id: 'invest-explore',
      version: '1.0.0',
      skills: ['financial-research', 'fundamental-analysis', 'market-data'],
      permissions: { allowFinancialWrites: false },
    });
  });

  test('rejects invalid versions and empty tool declarations', () => {
    const spec = getInvestmentAgentSpec('invest-plan');
    expect(() => validateAgentSpec({ ...spec, version: '1' })).toThrow();
    expect(() => validateAgentSpec({ ...spec, tools: [] })).toThrow();
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

  test('preserves legacy investment allowlists without widening them to all tools', () => {
    const spec = agentDefinitionToPiSpec({
      id: 'invest-explore',
      name: 'Investment Explore',
      description: 'Read-only investment research',
      config: { toolWhitelist: ['financial_metrics', 'web_search'] },
    });
    expect(spec.tools).toEqual(['financial_metrics', 'web_search']);
  });
});
