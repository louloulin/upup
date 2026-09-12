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
});
