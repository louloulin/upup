import { beforeEach, describe, expect, test } from 'bun:test';
import { getAgentRegistry, resetAgentRegistry } from '../runtime/pi/registry.js';
import { getPiAgentRegistry } from './agent-registry.js';

describe('Pi agent Pi catalog boundary', () => {
  beforeEach(() => {
    resetAgentRegistry();
    getPiAgentRegistry().reset();
  });

  test('stores executable behavior only as an UpUpAgentSpec and removes it from both catalogs', () => {
    const registry = getPiAgentRegistry();
    const agent = registry.register({
      id: 'pi-pi-fixture',
      name: 'Pi Custom Fixture',
      description: 'Deterministic custom worker',
      systemPrompt: 'Use Pi tools only.',
      tools: ['fixture_market_quote'],
      capabilities: ['research'],
      taskTypes: ['research'],
    });
    expect(agent.spec.tools).toEqual(['fixture_market_quote']);
    expect(getAgentRegistry().get('pi-pi-fixture')?.config?.tools).toEqual(['fixture_market_quote']);
    expect(registry.unregister(agent.id)).toBe(true);
    expect(registry.getAgent(agent.id)).toBeUndefined();
    expect(getAgentRegistry().get(agent.id)).toBeUndefined();
  });

  test('round-trips complete Pi execution metadata through export and import', () => {
    const registry = getPiAgentRegistry();
    registry.register({
      id: 'pi-roundtrip-fixture',
      name: 'Pi Roundtrip Fixture',
      description: 'Preserves package metadata across persistence boundaries',
      systemPrompt: 'Use trusted finance resources.',
      tools: ['finance_evidence_quote'],
      skills: ['finance-evidence'],
      capabilities: ['financial-research'],
      taskTypes: ['evidence'],
      mode: 'worker',
      workflow: 'invest',
      dataPolicy: 'historical',
      outputContract: 'evidence',
      permissions: {
        id: 'roundtrip-readonly',
        allow: ['safe', 'warning'],
        requireApproval: [],
        deny: ['dangerous', 'critical'],
        allowExternalNetwork: false,
        allowCredentialAccess: false,
        allowFinancialWrites: false,
      },
    });

    const exported = registry.exportConfig();
    const saved = exported.find((config) => config.id === 'pi-roundtrip-fixture');
    expect(saved).toMatchObject({
      skills: ['finance-evidence'],
      mode: 'worker',
      workflow: 'invest',
      dataPolicy: 'historical',
      outputContract: 'evidence',
      permissions: { id: 'roundtrip-readonly', allowExternalNetwork: false },
    });

    registry.reset();
    expect(registry.importConfig([saved!])).toBe(1);
    expect(registry.getAgent('pi-roundtrip-fixture')?.spec).toMatchObject({
      tools: ['finance_evidence_quote'],
      skills: ['finance-evidence'],
      mode: 'worker',
      permissions: { id: 'roundtrip-readonly', allowExternalNetwork: false },
      workflow: 'invest',
    });
  });
});
